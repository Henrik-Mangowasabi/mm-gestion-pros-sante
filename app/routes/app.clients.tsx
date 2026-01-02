// FICHIER : app/routes/app.clients.tsx
import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server";
import { getMetaobjectEntries } from "../lib/metaobject.server";

export const loader = async ({ request }: any) => {
  const { admin } = await authenticate.admin(request);

  // 1. On récupère les entrées de ton Métaobjet (tes Pros)
  const metaEntriesResult = await getMetaobjectEntries(admin);
  const metaEntries = metaEntriesResult.entries || [];

  // 2. RÉCUPÉRATION DE TOUS LES CLIENTS (BOUCLE DE PAGINATION)
  let allCustomers: any[] = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
      query getAllCustomers($cursor: String) {
        customers(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              firstName
              lastName
              email
              tags
              amountSpent { amount currencyCode }
              ordersCount
              state
            }
          }
        }
      }`,
      { variables: { cursor } }
    );

    const data = await response.json();
    const { edges, pageInfo } = data.data.customers;

    // On ajoute les clients de cette page à notre liste globale
    const nodes = edges.map((edge: any) => edge.node);
    allCustomers = allCustomers.concat(nodes);

    // On prépare la page suivante
    cursor = pageInfo.endCursor;
    hasNextPage = pageInfo.hasNextPage;
  }

  console.log("🚨 TOTAL CLIENTS RÉCUPÉRÉS :", allCustomers.length);

  // 3. FILTRE JAVASCRIPT (Fiable à 100%)
  // On ne garde que ceux qui ont le tag 'pro_sante'
  const proSanteCustomers = allCustomers.filter((c: any) => 
    c.tags && c.tags.includes('pro_sante')
  );

  console.log("🚨 CLIENTS AVEC TAG 'pro_sante' :", proSanteCustomers.length);

  // 4. On fait le lien avec les données des Pros
  const combinedData = proSanteCustomers.map((customer: any) => {
    const linkedEntry = metaEntries.find((e: any) => 
      e.customer_id === customer.id || 
      e.email?.toLowerCase() === customer.email?.toLowerCase()
    );
    
    return {
      ...customer,
      linkedCode: linkedEntry ? linkedEntry.code : "⚠️ Pas de lien",
      linkedAmount: linkedEntry ? linkedEntry.montant : "-",
      linkedStatus: linkedEntry ? (linkedEntry.status ? "Actif" : "Inactif") : "-",
    };
  });

  return { clients: combinedData };
};

export default function ClientsPage() {
  const { clients } = useLoaderData<typeof loader>();

  return (
    <div style={{ padding: "2rem", backgroundColor: "#f6f6f7", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#202223" }}>Clients Pro Santé ({clients.length})</h1>
          <Link to="/app" style={{ textDecoration: "none", color: "#008060", fontWeight: "bold" }}>← Retour Gestion</Link>
        </div>

        <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafafa", borderBottom: "1px solid #e1e3e5" }}>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "0.9rem", color: "#444" }}>Nom du Client</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "0.9rem", color: "#444" }}>Email</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "0.9rem", color: "#444" }}>Tags</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "0.9rem", color: "#444" }}>Code Promo Lié</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "0.9rem", color: "#444" }}>Réduction</th>
                <th style={{ padding: "16px", textAlign: "left", fontSize: "0.9rem", color: "#444" }}>Statut Promo</th>
                <th style={{ padding: "16px", textAlign: "right", fontSize: "0.9rem", color: "#444" }}>Dépenses Totales</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#888" }}>Aucun client avec le tag 'pro_sante' trouvé.</td></tr>
              ) : (
                clients.map((client: any, i: number) => (
                  <tr key={client.id} style={{ borderBottom: "1px solid #eee", backgroundColor: i % 2 === 0 ? "white" : "#fcfcfc" }}>
                    <td style={{ padding: "16px", fontWeight: "500" }}>{client.firstName} {client.lastName}</td>
                    <td style={{ padding: "16px", color: "#555" }}>{client.email}</td>
                    
                    <td style={{ padding: "16px" }}>
                        {client.tags && client.tags.map((tag: string) => (
                             <span key={tag} style={{ 
                                backgroundColor: tag === 'pro_sante' ? "#c4eec4" : "#e4e5e7", 
                                color: "#333",
                                padding: "2px 6px", 
                                borderRadius: "4px", 
                                fontSize: "0.75rem", 
                                marginRight: "4px",
                                display: "inline-block",
                                border: "1px solid #ddd"
                              }}>
                                {tag}
                              </span>
                        ))}
                    </td>

                    <td style={{ padding: "16px" }}>
                       {client.linkedCode !== "⚠️ Pas de lien" ? (
                         <span style={{ backgroundColor: "#e3f1df", color: "#008060", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace", fontWeight: "bold" }}>
                           {client.linkedCode}
                         </span>
                       ) : (
                         <span style={{ color: "#d82c0d", fontSize: "0.85rem" }}>⚠ Non synchronisé</span>
                       )}
                    </td>
                    
                    <td style={{ padding: "16px" }}>{client.linkedAmount}</td>
                    
                    <td style={{ padding: "16px" }}>
                        {client.linkedStatus === "Actif" && <span style={{color: "#008060"}}>● Actif</span>}
                        {client.linkedStatus === "Inactif" && <span style={{color: "#666"}}>○ Inactif</span>}
                    </td>

                    <td style={{ padding: "16px", textAlign: "right", fontWeight: "bold" }}>
                      {client.amountSpent?.amount} {client.amountSpent?.currencyCode} <br/>
                      <span style={{ fontSize: "0.75rem", fontWeight: "normal", color: "#888" }}>({client.ordersCount} commandes)</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
