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
  const lastName = parts.slice(1).join(" ") || firstName; 
  return { firstName, lastName };
}

// Cette fonction n'est plus utilisée par la nouvelle version optimisée, 
// mais on la garde pour éviter les erreurs d'import si elle est appelée ailleurs.
export async function getProSanteCustomers(admin: AdminApiContext) {
  return [];
}

export async function createCustomerMetafieldDefinitions(admin: AdminApiContext) {
  const mutation = `
    mutation metafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id name }
        userErrors { field message }
      }
    }
  `;

  const defs = [
    { namespace: "custom", key: "profession", name: "Profession", type: "single_line_text_field", ownerType: "CUSTOMER" },
    { namespace: "custom", key: "adresse", name: "Adresse postale", type: "single_line_text_field", ownerType: "CUSTOMER" }
  ];

  for (const def of defs) {
    try {
      const response = await admin.graphql(mutation, { variables: { definition: def } });
      const data = await response.json() as any;
      if (data.errors) console.error(`[MF DEF] Erreur GraphQL pour ${def.key}:`, data.errors);
      if (data.data?.metafieldDefinitionCreate?.userErrors?.length > 0) {
        console.warn(`[MF DEF] Info pour ${def.key}:`, data.data.metafieldDefinitionCreate.userErrors[0].message);
      }
    } catch (e) { console.error(`[MF DEF] Erreur crash pour ${def.key}:`, e); }
  }
}

export async function ensureCustomerPro(admin: AdminApiContext, rawEmail: string, name: string, profession?: string, adresse?: string) {
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
    }
  } catch (e) { console.error("Erreur recherche:", e); }

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

  // 3. Mise à jour complète (Nom, Email, Profession, Adresse physique)
  if (customerId) {
      console.log(`[CUSTOMER] Synchronisation finale des données pour ${customerId}...`);
      // On ne passe l'email que s'il est différent ou si on veut forcer la synchro
      await updateCustomerInShopify(admin, customerId, email, name, profession, adresse);
      
      // Ajout du Tag si manquant
      if (!currentTags.includes(PRO_TAG)) {
          console.log(`[CUSTOMER] Ajout du tag pro...`);
          const tagsAddMutation = `mutation tagsAdd($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`;
          await admin.graphql(tagsAddMutation, { variables: { id: customerId, tags: [PRO_TAG] } });
      }
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

export async function updateCustomerInShopify(admin: AdminApiContext, customerId: string, email?: string, name?: string, profession?: string, adresse?: string) {
  const input: any = { id: customerId };
  
  if (email) {
    input.email = email.trim().toLowerCase();
  }

  if (name) {
    const { firstName, lastName } = splitName(name);
    input.firstName = firstName;
    input.lastName = lastName;
  }

  // METAFIELDS
  const metafields = [];
  if (profession !== undefined) metafields.push({ namespace: "custom", key: "profession", value: profession, type: "single_line_text_field" });
  if (adresse !== undefined) metafields.push({ namespace: "custom", key: "adresse", value: adresse, type: "single_line_text_field" });
  
  if (metafields.length > 0) {
      input.metafields = metafields;
  }

  const m = `mutation customerUpdate($input: CustomerInput!) { customerUpdate(input: $input) { customer { id defaultAddress { id } } userErrors { field message } } }`;
  
  try {
      console.log(`👤 Update Customer ${customerId} ->`, input); 
      const r = await admin.graphql(m, { variables: { input } });
      const d = await r.json() as any;
      
      if (d.data?.customerUpdate?.userErrors?.length > 0) {
          console.error("Erreur Update Customer:", d.data.customerUpdate.userErrors);
          return { success: false, error: d.data.customerUpdate.userErrors[0].message };
      }

      // --- NOUVEAUTÉ : Mise à jour de l'adresse postale réelle ---
      if (adresse) {
          console.log(`🏠 [SYNC ADDR] Tentative pour ${customerId} avec : "${adresse}"`);
          const customerData = d.data.customerUpdate.customer;
          const defaultAddressId = customerData?.defaultAddress?.id;

          // Parsing plus intelligent de l'adresse (Format attendu : "Rue, CP Ville" ou "Rue CP Ville")
          let address1 = "À compléter";
          let city = "À compléter";
          let zip = "00000";

          // On cherche un code postal (5 chiffres suivis d'un espace et d'un nom de ville)
          const cpMatch = adresse.match(/(\d{5})\s+([^,]+)$/);
          if (cpMatch) {
              zip = cpMatch[1];
              city = cpMatch[2].trim();
              address1 = adresse.substring(0, cpMatch.index).trim().replace(/,$/, "") || "À compléter";
              console.log(`📍 [ADDR] Match CP trouvé : Zip=${zip}, City=${city}, Addr1=${address1}`);
          } else {
              // Fallback : si c'est un mot court sans chiffre (ex: "Paris" ou "Nantes")
              const hasDigits = /\d/.test(adresse);
              if (!hasDigits && adresse.length < 30) {
                  city = adresse.trim();
                  address1 = "À compléter";
                  console.log(`📍 [ADDR] Ville seule détectée : ${city}`);
              } else {
                  // Sinon on considère que c'est la rue
                  address1 = adresse.trim();
                  city = "À compléter";
                  console.log(`📍 [ADDR] Rue seule détectée : ${address1}`);
              }
          }

          const { firstName, lastName } = splitName(name || "");

          // On force le vidage des champs "test" ou parasites
          const addressInput: any = {
              address1: address1,
              address2: "", 
              company: "",
              city: city,
              zip: zip,
              province: "",
              provinceCode: "",
              country: "France",
              countryCode: "FR",
              firstName: firstName,
              lastName: lastName
          };

          if (defaultAddressId) {
              console.log(`🔄 [ADDR] Mise à jour adresse par défaut existante : ${defaultAddressId}`);
              const addrMutation = `
                mutation customerAddressUpdate($address: MailingAddressInput!, $addressId: ID!, $customerId: ID!) {
                  customerAddressUpdate(address: $address, addressId: $addressId, customerId: $customerId) {
                    userErrors { field message }
                  }
                }
              `;
              const rAddr = await admin.graphql(addrMutation, { 
                variables: { 
                  addressId: defaultAddressId, 
                  customerId: customerId,
                  address: addressInput 
                } 
              });
              const dAddr = await rAddr.json() as any;
              
              if (dAddr.errors) {
                  console.error("❌ [ADDR] Graphql Errors:", JSON.stringify(dAddr.errors));
              }

              if (dAddr.data?.customerAddressUpdate?.userErrors?.length > 0) {
                  console.error("❌ [ADDR] User Errors lors de l'update :", JSON.stringify(dAddr.data.customerAddressUpdate.userErrors));
              } else if (dAddr.data?.customerAddressUpdate) {
                  console.log("✅ [ADDR] Adresse mise à jour avec succès.");
              }
          } else {
              console.log(`➕ [ADDR] Création d'une première adresse par défaut pour le client.`);
              const createAddrMutation = `
                mutation customerAddressCreate($address: MailingAddressInput!, $customerId: ID!) {
                  customerAddressCreate(address: $address, customerId: $customerId) {
                    userErrors { field message }
                  }
                }
              `;
              const createRes = await admin.graphql(createAddrMutation, { 
                variables: { 
                  customerId: customerId, 
                  address: addressInput 
                } 
              });
              const createData = await createRes.json() as any;
              const errors = createData.data?.customerAddressCreate?.userErrors;
              
              if (errors && errors.length > 0) {
                  console.error("❌ [ADDR] Échec création adresse :", JSON.stringify(errors));
              } else if (createData.data?.customerAddressCreate) {
                  console.log("✅ [ADDR] Adresse créée avec succès.");
              }
          }
      }

      return { success: true };
  } catch (e) { 
      console.error("🔴 [SYNC] Crash critique dans updateCustomerInShopify :", e);
      return { success: false, error: String(e) }; 
  }
}