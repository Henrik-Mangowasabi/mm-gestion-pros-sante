// FICHIER : app/routes/app.clients.tsx
import { useLoaderData, Link } from "react-router";
import React, { useState } from "react";
import { authenticate } from "../shopify.server";
import { getMetaobjectEntries, checkMetaobjectStatus } from "../lib/metaobject.server";

export const loader = async ({ request }: any) => {
  const { admin } = await authenticate.admin(request);
  
  // 1. Vérification
  const status = await checkMetaobjectStatus(admin);
  if (!status.exists) return { clients: [], isInitialized: false };

  // 2. On récupère UNIQUEMENT nos Pros (via les Métaobjets)
  // C'est beaucoup plus rapide que de scanner tous les clients du shop
  const { entries } = await getMetaobjectEntries(admin);

  if (entries.length === 0) return { clients: [], isInitialized: true };

  // 3. On récupère les infos fraîches des clients Shopify (Nom, Email, Crédit Utilisé)
  // On utilise les ID stockés dans les métaobjets
  const customerIds = entries
    .map((e: any) => e.customer_id)
    .filter((id: string) => id && id.startsWith("gid://shopify/Customer/"));

  const customerMap = new Map<string, any>();

  if (customerIds.length > 0) {
    const query = `#graphql
      query getCustomersDetails($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Customer {
            id
            firstName
            lastName
            email
            metafield(namespace: "custom", key: "credit_used") { value }
          }
        }
      }
    `;
    
    try {
        const response = await admin.graphql(query, { variables: { ids: customerIds } });
        const data = await response.json();
        const nodes = data.data?.nodes || [];
        nodes.forEach((n: any) => {
            if (n) customerMap.set(n.id, n);
        });
    } catch (e) { console.error("Erreur Bulk Customers", e); }
  }

  // 4. On combine les données (Métaobjet + Cache + Client Shopify)
  const combinedData = entries.map((entry: any) => {
      // Données Shopify (Nom, Prénom, Crédit utilisé)
      const shopifyCustomer = customerMap.get(entry.customer_id);
      
      // Données Métaobjet (Cache Performance)
      // Si le cache est vide (ex: nouvelle install), on met 0
      const totalRevenue = entry.cache_revenue ? parseFloat(entry.cache_revenue) : 0;
      const ordersCount = entry.cache_orders_count ? parseInt(entry.cache_orders_count) : 0;

      // Calcul des Crédits (Règle : 10€ pour 500€ de CA)
      const creditEarned = Math.floor(totalRevenue / 500) * 10;
      const creditUsed = shopifyCustomer?.metafield?.value ? parseFloat(shopifyCustomer.metafield.value) : 0;
      const creditRemaining = creditEarned - creditUsed;

      // Construction de l'objet final pour l'affichage
      return {
          id: entry.customer_id || entry.id, // Fallback ID si pas de client lié
          firstName: shopifyCustomer?.firstName || entry.name.split(" ")[0], // Fallback nom interne
          lastName: shopifyCustomer?.lastName || entry.name.split(" ").slice(1).join(" "),
          email: shopifyCustomer?.email || entry.email,
          linkedCode: entry.code,
          ordersCount: ordersCount,
          totalRevenue: totalRevenue,
          creditEarned,
          creditUsed,
          creditRemaining
      };
  });

  return { clients: combinedData, isInitialized: true };
};

// Helper ID
const extractId = (gid: string) => gid ? gid.split("/").pop() : "";

export default function ClientsPage() {
  const { clients, isInitialized } = useLoaderData<typeof loader>();

  if (!isInitialized) {
      return (
        <div style={{ padding: "40px", textAlign: "center" }}>
            <h2>Application non initialisée</h2>
            <Link to="/app">Aller sur la page principale</Link>
        </div>
      );
  }

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const totalPages = Math.ceil(clients.length / itemsPerPage);
  const currentClients = clients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- STYLES ---
  const styles = {
    wrapper: { width: "100%", padding: "20px", backgroundColor: "#f6f6f7", fontFamily: "-apple-system, sans-serif", boxSizing: "border-box" as const },
    navButton: { textDecoration: "none", color: "#008060", fontWeight: "600", backgroundColor: "white", border: "1px solid #c9cccf", padding: "8px 16px", borderRadius: "4px", fontSize: "0.9rem", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s ease" },
    cell: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #eee" },
    cellCenter: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #eee", textAlign: "center" as const },
    cellPromo: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #e1e3e5", textAlign: "center" as const },
    cellPerf: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #b8d0eb", textAlign: "center" as const },
    cellCredit: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #e6dff0", textAlign: "center" as const },
    badgeCode: { backgroundColor: "#e3f1df", color: "#008060", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace", fontWeight: "bold", fontSize: "0.9rem" },
    adminBtn: { fontSize: "0.75rem", color: "#005bd3", textDecoration: "none", border: "1px solid #b8d0eb", padding: "4px 8px", borderRadius: "4px", backgroundColor: "#f0f8ff", fontWeight: "600" },
    paginationContainer: { display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", gap: "15px", backgroundColor: "white", borderTop: "1px solid #eee" },
    pageBtn: { padding: "6px 12px", border: "1px solid #ccc", backgroundColor: "white", borderRadius: "4px", cursor: "pointer", color: "#333", fontWeight: "500", fontSize: "0.9rem" },
    pageBtnDisabled: { padding: "6px 12px", border: "1px solid #eee", backgroundColor: "#f9fafb", borderRadius: "4px", cursor: "not-allowed", color: "#ccc", fontWeight: "500", fontSize: "0.9rem" }
  };

  const thStyle = { padding: "12px 10px", textAlign: "left" as const, fontSize: "0.8rem", textTransform: "uppercase" as const, color: "#888" };
  const thCenter = { ...thStyle, textAlign: "center" as const };
  const thPromoStyle = { ...thStyle, textAlign: "center" as const, backgroundColor: "#f1f8f5", color: "#008060", borderBottom: "2px solid #e1e3e5", borderLeft: "2px solid #e1e3e5" };
  const thPerfStyle = { ...thStyle, textAlign: "center" as const, backgroundColor: "#f0f8ff", color: "#005bd3", borderBottom: "2px solid #b8d0eb", borderLeft: "2px solid #b8d0eb" };
  const thCreditStyle = { ...thStyle, textAlign: "center" as const, backgroundColor: "#f9f4ff", color: "#9c6ade", borderBottom: "2px solid #e6dff0", borderLeft: "2px solid #e6dff0" };

  return (
    <div style={styles.wrapper}>
      <h1 style={{ color: "#202223", marginBottom: "20px", textAlign: "center", fontSize: "1.8rem", fontWeight: "700" }}>Gestion des Clients Pros</h1>

      <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginBottom: "20px" }}>
        <Link to="/app" className="nav-btn" style={styles.navButton}><span>🏥</span> Gestion Pros de Santé →</Link>
        <Link to="/app/codes_promo" className="nav-btn" style={styles.navButton}><span>🏷️</span> Gestion Codes Promo →</Link>
      </div>

      <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
        <div style={{ backgroundColor: "white", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #eee", backgroundColor: "#fafafa" }}>
            <h2 style={{ margin: 0, color: "#444", fontSize: "1.1rem", fontWeight: "600" }}>Liste des Clients Pros ({clients.length})</h2>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1200px" }}>
              <thead>
                <tr>
                  <th style={{...thStyle, width: "20%"}}>Nom Pro</th>
                  <th style={{...thStyle, width: "20%"}}>Email</th>
                  <th style={{...thCenter, width: "5%"}}>Lien</th>
                  <th style={{...thPromoStyle, width: "10%"}}>Code Promo</th>
                  <th style={{...thPerfStyle, width: "7.5%"}}>Com.</th>
                  <th style={{...thPerfStyle, width: "10%"}}>CA Généré</th>
                  <th style={{...thCreditStyle, width: "9%"}}>Gagné</th>
                  <th style={{...thCreditStyle, width: "9%"}}>Utilisé</th>
                  <th style={{...thCreditStyle, width: "9.5%", fontWeight: "800"}}>RESTANT</th>
                </tr>
              </thead>
              <tbody>
                {currentClients.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: "30px", textAlign: "center", color: "#888" }}>Aucun pro de santé enregistré.</td></tr>
                ) : (
                  currentClients.map((client: any, i: number) => {
                    const bgStd = i % 2 === 0 ? "white" : "#fafafa";
                    const bgPromo = i % 2 === 0 ? "#f7fbf9" : "#eef6f3";
                    const bgPerf = i % 2 === 0 ? "#f0f8ff" : "#e6f2ff";
                    const bgCredit = i % 2 === 0 ? "#fcfaff" : "#f6f0fd";
                    const borderPromo = { borderLeft: "2px solid #e1e3e5" };
                    const borderPerf = { borderLeft: "2px solid #b8d0eb" };
                    const borderCredit = { borderLeft: "2px solid #e6dff0" };

                    return (
                      <tr key={client.email + i}>
                        <td style={{ ...styles.cell, backgroundColor: bgStd }}>
                          <div style={{ fontWeight: "600", color: "#333", marginBottom: "4px" }}>{client.firstName} {client.lastName}</div>
                        </td>
                        <td style={{ ...styles.cell, backgroundColor: bgStd, color: "#666" }}>{client.email}</td>
                        <td style={{ ...styles.cellCenter, backgroundColor: bgStd }}>
                          {client.id && client.id.startsWith("gid://") ? (
                             <a href={`shopify:admin/customers/${extractId(client.id)}`} target="_top" style={styles.adminBtn} title="Voir le client">↗</a>
                          ) : ("-")}
                        </td>
                        <td style={{ ...styles.cellPromo, backgroundColor: bgPromo, ...borderPromo }}>
                             <span style={styles.badgeCode}>{client.linkedCode}</span>
                        </td>
                        <td style={{ ...styles.cellPerf, backgroundColor: bgPerf, ...borderPerf, fontWeight: "600", color: "#005bd3" }}>
                          {client.ordersCount}
                        </td>
                        <td style={{ ...styles.cellPerf, backgroundColor: bgPerf, fontWeight: "bold", color: "#005bd3" }}>
                          {client.totalRevenue.toFixed(2)} €
                        </td>
                        <td style={{ ...styles.cellCredit, backgroundColor: bgCredit, ...borderCredit, color: "#008060" }}>
                          {client.creditEarned > 0 ? `+${client.creditEarned} €` : "-"}
                        </td>
                        <td style={{ ...styles.cellCredit, backgroundColor: bgCredit, color: "#d82c0d" }}>
                          {client.creditUsed > 0 ? `-${client.creditUsed} €` : "-"}
                        </td>
                        <td style={{ ...styles.cellCredit, backgroundColor: bgCredit }}>
                          <span style={{ backgroundColor: client.creditRemaining > 0 ? "#9c6ade" : "#eee", color: client.creditRemaining > 0 ? "white" : "#999", padding: "4px 10px", borderRadius: "20px", fontWeight: "bold", fontSize: "0.85rem" }}>{client.creditRemaining} €</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {clients.length > itemsPerPage && (
            <div style={styles.paginationContainer}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={currentPage === 1 ? styles.pageBtnDisabled : styles.pageBtn}>← Précédent</button>
              <span style={{ fontSize: "0.9rem", color: "#555" }}>Page <strong>{currentPage}</strong> sur <strong>{totalPages || 1}</strong></span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={currentPage === totalPages ? styles.pageBtnDisabled : styles.pageBtn}>Suivant →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}