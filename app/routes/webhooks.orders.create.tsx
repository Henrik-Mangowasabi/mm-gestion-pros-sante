// FICHIER : app/routes/webhooks.orders.create.tsx
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload } = await authenticate.webhook(request);
  if (!admin) {
    console.error("❌ Webhook: admin non disponible");
    return new Response();
  }

  const order = payload as any;
  const discountCodes = order.discount_codes || [];

  console.log(`📦 Webhook orders/create déclenché pour la commande: ${order.name || order.id}`);
  console.log(`📋 Codes promo détectés:`, discountCodes.map((dc: any) => dc.code).join(", ") || "Aucun");

  // On ne s'intéresse qu'aux commandes qui rapportent de l'argent (Scenario EARN)
  // Le Scenario BURN est géré automatiquement par Shopify (Checkout) !
  if (discountCodes.length > 0) {
    const usedCode = discountCodes[0].code;
    // Utiliser le sous-total avant réduction pour calculer le CA généré réellement
    const orderAmount = parseFloat(order.subtotal_price || order.total_price);

    console.log(`🔍 Recherche du pro avec le code: ${usedCode}`);
    console.log(`💰 Montant de la commande (sous-total): ${orderAmount}€`);

    // Requête corrigée : récupérer tous les metaobjects et filtrer côté code
    const queryAllMetaobjects = `#graphql
      query getAllPros {
        metaobjects(first: 250, type: "mm_pro_de_sante") {
          edges {
            node {
              id
              fields {
                key
                value
              }
            }
          }
        }
      }
    `;

    try {
      const response = await admin.graphql(queryAllMetaobjects);
      const data = await response.json() as any;
      
      if (data.errors) {
        console.error("❌ Erreur GraphQL:", data.errors);
        return new Response();
      }

      const allMetaobjects = data.data?.metaobjects?.edges || [];
      console.log(`📊 Nombre total de metaobjects trouvés: ${allMetaobjects.length}`);

      // Chercher le metaobject avec le code correspondant
      let metaobjectNode: any = null;
      let customerIdValue: string | null = null;

      for (const edge of allMetaobjects) {
        const node = edge.node;
        const codeField = node.fields.find((f: any) => f.key === "code");
        if (codeField && codeField.value === usedCode) {
          metaobjectNode = node;
          const customerIdField = node.fields.find((f: any) => f.key === "customer_id");
          customerIdValue = customerIdField?.value || null;
          console.log(`✅ Metaobject trouvé pour le code ${usedCode}: ${node.id}`);
          break;
        }
      }

      if (!metaobjectNode) {
        console.warn(`⚠️ Aucun metaobject trouvé pour le code promo: ${usedCode}`);
        return new Response();
      }

      // 1. Récupération des compteurs actuels
      let currentRevenue = 0;
      let previousCreditEarned = 0;
      let currentCount = 0;

      metaobjectNode.fields.forEach((f: any) => {
        if (f.key === "cache_revenue" && f.value) currentRevenue = parseFloat(f.value);
        if (f.key === "cache_credit_earned" && f.value) previousCreditEarned = parseFloat(f.value);
        if (f.key === "cache_orders_count" && f.value) currentCount = parseInt(f.value);
      });

      console.log(`📊 État actuel - CA: ${currentRevenue}€ | Commandes: ${currentCount} | Crédit déjà versé: ${previousCreditEarned}€`);

      // 2. Calcul du NOUVEAU total théorique
      const newRevenue = currentRevenue + orderAmount;
      const newCount = currentCount + 1;
      
      // Règle : 10€ tous les 500€ de CA (Total à vie)
      const totalCreditShouldBe = Math.floor(newRevenue / 500) * 10;

      // 3. Calcul du montant à verser (Le Delta)
      const amountToDeposit = totalCreditShouldBe - previousCreditEarned;

      console.log(`💰 Nouveau CA: ${newRevenue}€ | Nouveau nombre de commandes: ${newCount}`);
      console.log(`💳 Crédit total dû: ${totalCreditShouldBe}€ | Montant à verser: ${amountToDeposit}€`);

      if (amountToDeposit > 0) {
        console.log(`🚀 VIREMENT EN COURS DE ${amountToDeposit}€ ...`);

        // A. Trouver le Compte Crédit du client Shopify
        if (customerIdValue) {
          const queryAccount = `#graphql
            query getStoreCredit($id: ID!) {
              customer(id: $id) {
                storeCreditAccounts(first: 1) {
                  edges { node { id } }
                }
              }
            }
          `;
          const rAccount = await admin.graphql(queryAccount, { variables: { id: customerIdValue }});
          const dAccount = await rAccount.json();
          const accountId = dAccount.data?.customer?.storeCreditAccounts?.edges?.[0]?.node?.id;

          if (accountId) {
            // B. Faire le virement (Mutation Native)
            const mutationCredit = `#graphql
              mutation creditStore($id: ID!, $amount: MoneyInput!) {
                storeCreditAccountCredit(id: $id, creditInput: {amount: $amount}) {
                  storeCreditAccountTransaction { amount { amount } }
                  userErrors { message }
                }
              }
            `;
            
            const rCredit = await admin.graphql(mutationCredit, { 
              variables: { 
                id: accountId, 
                amount: { amount: amountToDeposit, currencyCode: "EUR" } 
              }
            });
            const dCredit = await rCredit.json();

            if (dCredit.data?.storeCreditAccountCredit?.userErrors?.length > 0) {
              console.error("❌ Erreur Virement:", dCredit.data.storeCreditAccountCredit.userErrors);
            } else {
              console.log("✅ Virement effectué avec succès sur le compte Shopify !");
            }
          } else {
            console.error("❌ Pas de compte Crédit trouvé pour ce client (Fonctionnalité active ?)");
          }
        } else {
          console.warn(`⚠️ Aucun customer_id trouvé pour ce metaobject, impossible de créditer le compte`);
        }
      }

      // 4. Mettre à jour notre cache (pour ne pas le re-payer la prochaine fois)
      // On met à jour "cache_credit_earned" avec le nouveau total théorique
      console.log(`🔄 Mise à jour du metaobject ${metaobjectNode.id}...`);
      const updateResponse = await admin.graphql(`#graphql
        mutation metaobjectUpdate($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) { 
            metaobject { id }
            userErrors { field message } 
          }
        }
      `, {
        variables: {
          id: metaobjectNode.id,
          metaobject: {
            fields: [
              { key: "cache_revenue", value: String(newRevenue) },
              { key: "cache_orders_count", value: String(newCount) },
              { key: "cache_credit_earned", value: String(totalCreditShouldBe) } // Important : On stocke le nouveau palier atteint
            ]
          }
        }
      });
      
      const updateData = await updateResponse.json() as any;
      if (updateData.data?.metaobjectUpdate?.userErrors?.length > 0) {
        console.error("❌ Erreur lors de la mise à jour du metaobject:", updateData.data.metaobjectUpdate.userErrors);
      } else {
        console.log(`✅ Metaobject mis à jour avec succès ! Nouveau CA: ${newRevenue}€ | Nouvelles commandes: ${newCount}`);
      }
    } catch (e) { 
      console.error("❌ Erreur Webhook:", e);
      if (e instanceof Error) {
        console.error("❌ Message d'erreur:", e.message);
        console.error("❌ Stack:", e.stack);
      }
    }
  } else {
    console.log("ℹ️ Aucun code promo détecté dans cette commande, webhook ignoré");
  }

  return new Response();
};