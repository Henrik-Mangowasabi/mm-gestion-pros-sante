// FICHIER : app/lib/metaobject.server.ts
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { createShopifyDiscount, updateShopifyDiscount, deleteShopifyDiscount } from "./discount.server";
import { ensureCustomerPro, removeCustomerProTag, updateCustomerEmailInShopify } from "./customer.server";

const METAOBJECT_TYPE = "mm_pro_de_sante";
const METAOBJECT_NAME = "MM Pro de santé";

// --- VÉRIFICATIONS ---
export async function checkMetaobjectExists(admin: AdminApiContext): Promise<boolean> {
  // On récupère tout et on cherche si notre type existe
  const query = `query { metaobjectDefinitions(first: 250) { edges { node { type } } } }`;
  try {
    const response = await admin.graphql(query);
    const data = await response.json() as any;
    return data.data?.metaobjectDefinitions?.edges?.some((e: any) => e.node?.type === METAOBJECT_TYPE);
  } catch (error) { return false; }
}

export async function checkMetaobjectStatus(admin: AdminApiContext) {
  const exists = await checkMetaobjectExists(admin);
  return { exists };
}

// --- CRÉATION STRUCTURE ---
export async function createMetaobject(admin: AdminApiContext) {
  const mutation = `
    mutation metaobjectDefinitionCreate($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition { id }
        userErrors { field message }
      }
    }
  `;

  const fieldDefinitions = [
    { name: "Identification", key: "identification", type: "single_line_text_field", required: true },
    { name: "Name", key: "name", type: "single_line_text_field", required: true },
    { name: "Email", key: "email", type: "single_line_text_field", required: true },
    { name: "Code Name", key: "code", type: "single_line_text_field", required: true },
    { name: "Montant", key: "montant", type: "number_decimal", required: true },
    { name: "Type", key: "type", type: "single_line_text_field", required: true, validations: [{ name: "choices", value: JSON.stringify(["%", "€"]) }] },
    { name: "Discount ID", key: "discount_id", type: "single_line_text_field", required: false },
    { name: "Status", key: "status", type: "boolean", required: false },
    { name: "Customer ID", key: "customer_id", type: "single_line_text_field", required: false }
  ];

  const variables = { definition: { name: METAOBJECT_NAME, type: METAOBJECT_TYPE, fieldDefinitions, capabilities: { publishable: { enabled: true } } } };

  try {
    const response = await admin.graphql(mutation, { variables });
    const data = await response.json() as any;
    if (data.data?.metaobjectDefinitionCreate?.userErrors?.length > 0) {
        const errors = data.data.metaobjectDefinitionCreate.userErrors;
        if(errors[0].message.includes("taken")) return { success: true };
        return { success: false, error: errors[0].message };
    }
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- LECTURE ---
export async function getMetaobjectEntries(admin: AdminApiContext) {
  const query = `
    query {
      metaobjects(first: 250, type: "${METAOBJECT_TYPE}") {
        edges {
          node {
            id
            fields { key value }
          }
        }
      }
    }
  `;
  try {
    const response = await admin.graphql(query);
    const data = await response.json() as any;
    const entries = data.data?.metaobjects?.edges?.map((edge: any) => {
      const node = edge.node;
      const entry: any = { id: node.id };
      node.fields.forEach((f: any) => {
        if (f.key === "montant") entry[f.key] = f.value ? parseFloat(f.value) : null;
        else if (f.key === "status") entry[f.key] = f.value === "true"; 
        else entry[f.key] = f.value;
      });
      if (entry.status === undefined) entry.status = true; 
      return entry;
    }).filter(Boolean) || [];
    return { entries };
  } catch (error) { return { entries: [], error: String(error) }; }
}

// --- CRÉATION ENTRÉE ---
export async function createMetaobjectEntry(admin: AdminApiContext, fields: any) {
  const discountName = `Code promo Pro Sante - ${fields.name}`;
  
  // 1. Créer le code promo
  const discountResult = await createShopifyDiscount(admin, {
    code: fields.code,
    montant: fields.montant,
    type: fields.type,
    name: discountName
  });

  if (!discountResult.success) return { success: false, error: "Erreur Promo: " + discountResult.error };

  // 2. Gérer le client (Création ou Tag)
  const clientResult = await ensureCustomerPro(admin, fields.email, fields.name);
  const customerIdToSave = clientResult.customerId ? String(clientResult.customerId) : "";

  const fieldsInput = [
    { key: "identification", value: String(fields.identification) },
    { key: "name", value: String(fields.name) },
    { key: "email", value: String(fields.email) },
    { key: "code", value: String(fields.code) },
    { key: "montant", value: String(fields.montant) },
    { key: "type", value: String(fields.type) },
    { key: "discount_id", value: discountResult.discountId || "" },
    { key: "status", value: "true" },
    { key: "customer_id", value: customerIdToSave } 
  ];

  const mutation = `mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $metaobject) { metaobject { id }, userErrors { field message } } }`;

  try {
    const response = await admin.graphql(mutation, { variables: { metaobject: { type: METAOBJECT_TYPE, fields: fieldsInput } } });
    const data = await response.json() as any;
    if (data.data?.metaobjectCreate?.userErrors?.length > 0) return { success: false, error: data.data.metaobjectCreate.userErrors[0].message };
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- UPDATE (C'est ici la logique critique) ---
export async function updateMetaobjectEntry(admin: AdminApiContext, id: string, fields: any) {
  console.log(`🔄 Update demandé pour ${id}`, fields);

  // 1. Récupérer les anciennes valeurs (pour avoir les ID Discount et Customer)
  const currentEntryQuery = `query($id: ID!) { metaobject(id: $id) { fields { key, value } } }`;
  let oldData: any = {};
  
  try {
    const r = await admin.graphql(currentEntryQuery, { variables: { id } });
    const d = await r.json() as any;
    const currentFields = d.data?.metaobject?.fields || [];
    currentFields.forEach((f: any) => { oldData[f.key] = f.value; });
  } catch (e) {
    return { success: false, error: "Impossible de lire l'entrée avant update" };
  }

  // 2. Mise à jour du Code Promo Shopify (Si nécessaire)
  if (oldData.discount_id) {
    const discountName = `Code promo Pro Sante - ${fields.name}`;
    await updateShopifyDiscount(admin, oldData.discount_id, {
      code: fields.code,
      montant: fields.montant,
      type: fields.type,
      name: discountName
    });
  }

  // 3. Mise à jour du Client Shopify (Si l'email a changé)
  // On compare l'ancien email stocké et le nouveau
  if (oldData.customer_id && fields.email && fields.email.trim().toLowerCase() !== (oldData.email || "").trim().toLowerCase()) {
    console.log(`📧 Changement email détecté : ${oldData.email} -> ${fields.email}`);
    
    const updateClientResult = await updateCustomerEmailInShopify(admin, oldData.customer_id, fields.email, fields.name);
    
    if (!updateClientResult.success) {
      console.error("❌ Echec update email client:", updateClientResult.error);
      // On continue quand même pour mettre à jour le métaobjet
    } else {
      console.log("✅ Email client Shopify mis à jour avec succès.");
    }
  }

  // 4. Mise à jour du Métaobjet
  const fieldsInput: any[] = [];
  if (fields.identification) fieldsInput.push({ key: "identification", value: String(fields.identification) });
  if (fields.name) fieldsInput.push({ key: "name", value: String(fields.name) });
  if (fields.email) fieldsInput.push({ key: "email", value: String(fields.email) });
  if (fields.code) fieldsInput.push({ key: "code", value: String(fields.code) });
  if (fields.montant) fieldsInput.push({ key: "montant", value: String(fields.montant) });
  if (fields.type) fieldsInput.push({ key: "type", value: String(fields.type) });
  if (fields.status !== undefined) fieldsInput.push({ key: "status", value: String(fields.status) });

  const mutation = `mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) { metaobjectUpdate(id: $id, metaobject: $metaobject) { userErrors { field message } } }`;
  
  try {
      const r = await admin.graphql(mutation, { variables: { id, metaobject: { fields: fieldsInput } } });
      const d = await r.json() as any;
      if (d.data?.metaobjectUpdate?.userErrors?.length > 0) return { success: false, error: d.data.metaobjectUpdate.userErrors[0].message };
      return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// --- DELETE ENTREE SIMPLE ---
export async function deleteMetaobjectEntry(admin: AdminApiContext, id: string) {
  const currentEntryQuery = `query($id: ID!) { metaobject(id: $id) { fields { key, value } } }`;
  try {
    const r = await admin.graphql(currentEntryQuery, { variables: { id } });
    const d = await r.json() as any;
    const fields = d.data?.metaobject?.fields || [];
    
    const linkedCustomerId = fields.find((f:any) => f.key === "customer_id")?.value;
    const entryEmail = fields.find((f:any) => f.key === "email")?.value;
    const existingDiscountId = fields.find((f:any) => f.key === "discount_id")?.value;

    if (linkedCustomerId) await removeCustomerProTag(admin, linkedCustomerId);
    else if (entryEmail) await removeCustomerProTag(admin, entryEmail);

    if (existingDiscountId) await deleteShopifyDiscount(admin, existingDiscountId);

    const mutation = `mutation metaobjectDelete($id: ID!) { metaobjectDelete(id: $id) { userErrors { field message } } }`;
    await admin.graphql(mutation, { variables: { id } });
    return { success: true };
  } catch (error) { return { success: false, error: String(error) }; }
}

// --- DELETE TOTAL (CORRIGÉ) ---
export async function destroyMetaobjectStructure(admin: AdminApiContext) {
  console.log("☢️ DÉMARRAGE SUPPRESSION TOTALE...");

  try {
    // 1. Récupérer TOUTES les définitions (CORRECTION ICI : PLUS DE QUERY DANS L'ARGUMENT)
    const queryDefinitions = `query { metaobjectDefinitions(first: 250) { edges { node { id, type } } } }`;
    const rDef = await admin.graphql(queryDefinitions);
    const dDef = await rDef.json() as any;
    
    // On cherche l'ID en filtrant en JS (car l'API ne supporte pas bien le filtre query sur ce endpoint)
    const definitionNode = dDef.data?.metaobjectDefinitions?.edges?.find(
        (e: any) => e.node.type === METAOBJECT_TYPE
    )?.node;
    
    const definitionId = definitionNode?.id;

    // 2. Récupérer et supprimer toutes les entrées proprement
    const { entries } = await getMetaobjectEntries(admin);
    console.log(`🧹 Nettoyage de ${entries.length} entrées...`);
    for (const entry of entries) {
      // On utilise la fonction standard pour bien nettoyer les tags et discounts
      await deleteMetaobjectEntry(admin, entry.id);
    }

    // 3. Supprimer la structure
    if (definitionId) {
      console.log(`🗑 Suppression Définition : ${definitionId}`);
      const mutation = `mutation metaobjectDefinitionDelete($id: ID!) { metaobjectDefinitionDelete(id: $id) { userErrors { field message } } }`;
      
      const rDel = await admin.graphql(mutation, { variables: { id: definitionId } });
      const dDel = await rDel.json() as any;
      
      if (dDel.data?.metaobjectDefinitionDelete?.userErrors?.length > 0) {
          console.warn("Info Delete Def:", dDel.data.metaobjectDefinitionDelete.userErrors);
      }
    } else {
        console.log("⚠️ Aucune définition trouvée à supprimer.");
    }

    return { success: true };

  } catch (error) {
    console.error("❌ CRASH DESTROY:", error);
    return { success: false, error: String(error) };
  }
}