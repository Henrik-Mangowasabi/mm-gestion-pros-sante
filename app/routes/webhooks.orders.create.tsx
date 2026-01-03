// FICHIER : app/routes/webhooks.orders.create.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Réception du Webhook (Shopify nous envoie la commande)
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    return new Response();
  }

  // La commande reçue
  const order = payload as any;

  console.log(`📦 Webhook Order reçu: ${order.name || order.id}`);

  // 2. Vérifier s'il y a un code de réduction utilisé
  const discountCodes = order.discount_codes || [];
  if (discountCodes.length === 0) {
    return new Response(); // Pas de code, on s'en fiche
  }

  // On prend le premier code (souvent il n'y en a qu'un)
  const usedCode = discountCodes[0].code;
  
  // Le montant total de la commande (Prix payé par le client)
  const orderAmount = parseFloat(order.total_price);

  try {
    // 3. Chercher le Métaobjet qui possède ce code
    // On utilise une query GraphQL pour filtrer par le champ "code"
    const query = `
      query {
        metaobjects(first: 1, type: "mm_pro_de_sante", query: "code:'${usedCode}'") {
          edges {
            node {
              id
              fields { key value }
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json() as any;
    const metaobjectNode = data.data?.metaobjects?.edges?.[0]?.node;

    if (metaobjectNode) {
      console.log(`✅ Partenaire trouvé pour le code ${usedCode} -> ID: ${metaobjectNode.id}`);

      // 4. Récupérer les anciennes valeurs (Cache)
      let currentRevenue = 0;
      let currentCount = 0;

      metaobjectNode.fields.forEach((f: any) => {
        if (f.key === "cache_revenue" && f.value) currentRevenue = parseFloat(f.value);
        if (f.key === "cache_orders_count" && f.value) currentCount = parseInt(f.value);
      });

      // 5. Calculer les nouvelles valeurs
      const newRevenue = currentRevenue + orderAmount;
      const newCount = currentCount + 1;

      // 6. Mettre à jour le Métaobjet
      const mutation = `
        mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            userErrors { field message }
          }
        }
      `;

      const updateVariables = {
        id: metaobjectNode.id,
        metaobject: {
          fields: [
            { key: "cache_revenue", value: String(newRevenue) },
            { key: "cache_orders_count", value: String(newCount) }
          ]
        }
      };

      await admin.graphql(mutation, { variables: updateVariables });
      console.log(`💰 Stats mises à jour : Rev ${newRevenue} | Count ${newCount}`);
    } else {
      console.log(`ℹ️ Code ${usedCode} utilisé, mais ne correspond à aucun Pro de santé.`);
    }

  } catch (error) {
    console.error("❌ Erreur Webhook Order:", error);
    // On renvoie quand même 200 OK à Shopify pour qu'il ne réessaie pas indéfiniment
  }

  return new Response();
};