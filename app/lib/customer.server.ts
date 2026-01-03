// FICHIER : app/lib/customer.server.ts
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const PRO_TAG = "pro_sante";

function cleanEmail(email: string) {
  return email ? email.trim().toLowerCase() : "";
}

// Fonction utilitaire pour découper le nom
function splitName(fullName: string) {
  const parts = fullName.trim().split(" ");
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || firstName; // Si pas de nom de famille, on répète le prénom pour éviter l'erreur
  return { firstName, lastName };
}

export async function getProSanteCustomers(admin: AdminApiContext) {
  // Cette fonction n'est plus utilisée par la nouvelle version optimisée, 
  // mais on la garde pour éviter les erreurs d'import si elle est appelée ailleurs.
  return [];
}

export async function ensureCustomerPro(admin: AdminApiContext, rawEmail: string, name: string) {
  const email = cleanEmail(rawEmail);
  const { firstName, lastName } = splitName(name);
  
  console.log(`[CUSTOMER] Traitement pour : ${email} (Nom: ${firstName} ${lastName})`);

  // 1. Recherche Client Existant
  const searchQuery = `query { customers(first: 1, query: "email:${email}") { edges { node { id, tags } } } }`;
  let customerId = null;
  let currentTags: string[] = [];

  try {
    const response = await admin.graphql(searchQuery);
    const data = await response.json() as any;
    const existing = data.data?.customers?.edges?.[0]?.node;
    
    if (existing) {
      console.log(`[CUSTOMER] Trouvé existant : ${existing.id}`);
      customerId = existing.id;
      currentTags = existing.tags || [];

      // --- NOUVEAUTÉ : MISE À JOUR FORCÉE DU NOM ---
      console.log(`[CUSTOMER] Mise à jour du nom vers : ${firstName} ${lastName}`);
      const updateMutation = `
        mutation customerUpdate($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }
      `;
      
      // On force la mise à jour du nom
      await admin.graphql(updateMutation, {
        variables: {
          input: {
            id: customerId,
            firstName: firstName,
            lastName: lastName
          }
        }
      });
    }
  } catch (e) { console.error("Erreur recherche/update:", e); }

  // 2. Création si n'existe pas
  if (!customerId) {
    console.log(`[CUSTOMER] Inconnu. Création en cours...`);
    const createMutation = `mutation customerCreate($input: CustomerInput!) { customerCreate(input: $input) { customer { id }, userErrors { field message } } }`;
    
    const variables = {
      input: {
        email: email,
        firstName: firstName,
        lastName: lastName,
        tags: [PRO_TAG],
        emailMarketingConsent: { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN" }
      }
    };
    try {
      const r = await admin.graphql(createMutation, { variables });
      const d = await r.json() as any;
      if (d.data?.customerCreate?.userErrors?.length > 0) {
          console.error("[CUSTOMER] Erreur création:", d.data.customerCreate.userErrors);
          return { success: false, error: d.data.customerCreate.userErrors[0].message };
      }
      customerId = d.data?.customerCreate?.customer?.id;
      console.log(`[CUSTOMER] Créé avec succès : ${customerId}`);
    } catch (e) { return { success: false, error: String(e) }; }
  } 
  // 3. Ajout Tag si existe déjà (et qu'il ne l'avait pas)
  else if (!currentTags.includes(PRO_TAG)) {
      console.log(`[CUSTOMER] Ajout du tag...`);
      const tagsAddMutation = `mutation tagsAdd($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`;
      await admin.graphql(tagsAddMutation, { variables: { id: customerId, tags: [PRO_TAG] } });
  }

  return { success: true, customerId: customerId };
}

export async function removeCustomerProTag(admin: AdminApiContext, idOrEmail: string) {
    let customerId = idOrEmail.startsWith("gid://") ? idOrEmail : null;

    if (!customerId) {
        const email = cleanEmail(idOrEmail);
        const q = `query { customers(first: 1, query: "email:${email}") { edges { node { id } } } }`;
        const r = await admin.graphql(q);
        const d = await r.json() as any;
        customerId = d.data?.customers?.edges?.[0]?.node?.id;
    }

    if (!customerId) return { success: true };

    const m = `mutation tagsRemove($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`;
    await admin.graphql(m, { variables: { id: customerId, tags: [PRO_TAG] } });
    return { success: true };
}

export async function updateCustomerEmailInShopify(admin: AdminApiContext, customerId: string, newEmail: string, newName?: string) {
  const email = cleanEmail(newEmail);
  
  const input: any = { id: customerId, email: email };
  if (newName) {
      const { firstName, lastName } = splitName(newName);
      input.firstName = firstName;
      input.lastName = lastName;
  }

  const m = `mutation customerUpdate($input: CustomerInput!) { customerUpdate(input: $input) { userErrors { field message } } }`;
  
  try {
      const r = await admin.graphql(m, { variables: { input } });
      const d = await r.json() as any;
      
      if (d.data?.customerUpdate?.userErrors?.length > 0) {
          console.error("Erreur Update Customer:", d.data.customerUpdate.userErrors);
          return { success: false, error: d.data.customerUpdate.userErrors[0].message };
      }
      return { success: true };
  } catch (e) { 
      return { success: false, error: String(e) }; 
  }
}