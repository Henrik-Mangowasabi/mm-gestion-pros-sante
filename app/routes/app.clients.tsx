// FICHIER : app/routes/app.clients.tsx
import { useLoaderData, Link } from "react-router";
import React, { useState } from "react";
import { authenticate } from "../shopify.server";
import { getMetaobjectEntries, checkMetaobjectStatus } from "../lib/metaobject.server";

export const loader = async ({ request }: any) => {
  const { admin } = await authenticate.admin(request);
  
  // VÉRIFICATION INITIALISATION
  const status = await checkMetaobjectStatus(admin);
  if (!status.exists) return { clients: [], isInitialized: false };

  const metaEntriesResult = await getMetaobjectEntries(admin);
  const metaEntries = metaEntriesResult.entries || [];

  let allCustomers: any[] = [];
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const response = await admin.graphql(
        `#graphql
        query getAllCustomers($cursor: String) {
          customers(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges { node { id, firstName, lastName, email, tags, metafield(namespace: "custom", key: "credit_used") { value } } }
          }
        }`, { variables: { cursor } }
      );
      const data = await response.json();
      if (data.errors) break;
      allCustomers = allCustomers.concat(data.data.customers.edges.map((e: any) => e.node));
      cursor = data.data.customers.pageInfo.endCursor;
      hasNextPage = data.data.customers.pageInfo.hasNextPage;
    }
  } catch (error) { console.log("Erreur Customers:", error); }

  const proSanteCustomers = allCustomers.filter((c: any) => c.tags && c.tags.includes('pro_sante'));

  const combinedData = await Promise.all(proSanteCustomers.map(async (customer: any) => {
    const linkedEntry = metaEntries.find((e: any) => e.customer_id === customer.id || (e.email && customer.email && e.email.toLowerCase() === customer.email.toLowerCase()));
    const codePromo = linkedEntry ? linkedEntry.code : null;
    let stats = { count: 0, totalRevenue: 0 };

    if (codePromo) {
      try {
        const orderResponse = await admin.graphql(`#graphql query getOrdersByCode($query: String!) { orders(first: 50, query: $query) { nodes { id, totalPriceSet { shopMoney { amount } } } } }`, { variables: { query: `discount_code:${codePromo}` } });
        const orderData = await orderResponse.json();
        const orders = orderData.data?.orders?.nodes || [];
        stats.count = orders.length;
        stats.totalRevenue = orders.reduce((sum: number, order: any) => sum + parseFloat(order.totalPriceSet?.shopMoney?.amount || "0"), 0);
      } catch (err) { console.error(`Erreur récupération commandes`, err); }
    }

    const creditEarned = Math.floor(stats.totalRevenue / 500) * 10;
    const creditUsed = customer.metafield?.value ? parseFloat(customer.metafield.value) : 0;
    const creditRemaining = creditEarned - creditUsed;

    return { ...customer, linkedCode: codePromo || "⚠️ Pas de lien", ordersCount: stats.count, totalRevenue: stats.totalRevenue, creditEarned, creditUsed, creditRemaining };
  }));

  return { clients: combinedData, isInitialized: true };
};

// Helper ID
const extractId = (gid: string) => gid ? gid.split("/").pop() : "";

export default function ClientsPage() {
  const { clients, isInitialized } = useLoaderData<typeof loader>();

  // ECRAN NON INITIALISÉ
  if (!isInitialized) {
      return (
        <div style={{ width: "100%", height: "80vh", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "#f6f6f7" }}>
            <div style={{ backgroundColor: "white", padding: "40px", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", maxWidth: "500px", textAlign: "center" }}>
                <h2 style={{ fontSize: "1.2rem", marginBottom: "15px", color: "#d82c0d" }}>Application non initialisée</h2>
                <p style={{ color: "#666", marginBottom: "30px" }}>Veuillez vous rendre sur la page principale pour configurer l'application.</p>
                <Link to="/app" style={{ textDecoration: "none", padding: "12px 24px", backgroundColor: "#008060", color: "white", borderRadius: "8px", fontWeight: "600" }}>
                    Aller sur la page principale
                </Link>
            </div>
        </div>
      );
  }

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const totalPages = Math.ceil(clients.length / itemsPerPage);
  const currentClients = clients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const styles = {
    wrapper: { width: "100%", padding: "20px", backgroundColor: "#f6f6f7", fontFamily: "-apple-system, sans-serif", boxSizing: "border-box" as const },
    navButton: { textDecoration: "none", color: "#008060", fontWeight: "600", backgroundColor: "white", border: "1px solid #c9cccf", padding: "8px 16px", borderRadius: "4px", fontSize: "0.9rem", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s ease" },
    infoDetails: { marginBottom: "20px", backgroundColor: "white", borderRadius: "8px", border: "1px solid #e1e3e5", borderLeft: "4px solid #008060", boxShadow: "0 2px 4px rgba(0,0,0,0.05)", overflow: "hidden" },
    infoSummary: { padding: "12px 20px", cursor: "pointer", fontWeight: "600", color: "#444", outline: "none", listStyle: "none" },
    
    // CELLULES (Padding 16px)
    cell: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #eee" },
    cellCenter: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #eee", textAlign: "center" as const },
    
    // ZONES COLORÉES
    cellPromo: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #e1e3e5", textAlign: "center" as const },
    cellPerf: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #b8d0eb", textAlign: "center" as const },
    cellCredit: { padding: "16px 12px", fontSize: "0.9rem", verticalAlign: "middle", borderBottom: "1px solid #e6dff0", textAlign: "center" as const },
    
    // BADGES & BTNS
    badgeCode: { backgroundColor: "#e3f1df", color: "#008060", padding: "4px 8px", borderRadius: "4px", fontFamily: "monospace", fontWeight: "bold", fontSize: "0.9rem" },
    adminBtn: { fontSize: "0.75rem", color: "#005bd3", textDecoration: "none", border: "1px solid #b8d0eb", padding: "4px 8px", borderRadius: "4px", backgroundColor: "#f0f8ff", fontWeight: "600" },

    paginationContainer: { display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", gap: "15px", backgroundColor: "white", borderTop: "1px solid #eee" },
    pageBtn: { padding: "6px 12px", border: "1px solid #ccc", backgroundColor: "white", borderRadius: "4px", cursor: "pointer", color: "#333", fontWeight: "500", fontSize: "0.9rem" },
    pageBtnDisabled: { padding: "6px 12px", border: "1px solid #eee", backgroundColor: "#f9fafb", borderRadius: "4px", cursor: "not-allowed", color: "#ccc", fontWeight: "500", fontSize: "0.9rem" }
  };

  const containerMaxWidth = "1600px";
  
  // HEADERS
  const thStyle = { padding: "12px 10px", textAlign: "left" as const, fontSize: "0.8rem", textTransform: "uppercase" as const, color: "#888" };
  const thCenter = { ...thStyle, textAlign: "center" as const };
  
  // HEADERS COLORÉS
  const thPromoStyle = { ...thStyle, textAlign: "center" as const, backgroundColor: "#f1f8f5", color: "#008060", borderBottom: "2px solid #e1e3e5", borderLeft: "2px solid #e1e3e5" }; // VERT
  const thPerfStyle = { ...thStyle, textAlign: "center" as const, backgroundColor: "#f0f8ff", color: "#005bd3", borderBottom: "2px solid #b8d0eb", borderLeft: "2px solid #b8d0eb" }; // BLEU
  const thCreditStyle = { ...thStyle, textAlign: "center" as const, backgroundColor: "#f9f4ff", color: "#9c6ade", borderBottom: "2px solid #e6dff0", borderLeft: "2px solid #e6dff0" }; // VIOLET

  return (
    <div style={styles.wrapper}>
      <style>{`.nav-btn:hover { background-color: #f1f8f5 !important; border-color: #008060 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important; }`}</style>

      <h1 style={{ color: "#202223", marginBottom: "20px", textAlign: "center", fontSize: "1.8rem", fontWeight: "700" }}>Gestion des Clients Pros</h1>

      <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginBottom: "20px" }}>
        <Link to="/app" className="nav-btn" style={styles.navButton}><span>🏥</span> Gestion Pros de Santé →</Link>
        <Link to="/app/codes_promo" className="nav-btn" style={styles.navButton}><span>🏷️</span> Gestion Codes Promo →</Link>
      </div>

      <div style={{ maxWidth: containerMaxWidth, margin: "0 auto" }}>
        <details style={styles.infoDetails}>
          <summary style={styles.infoSummary}>ℹ️ Règles de calcul (Cliquez pour dérouler)</summary>
          <div style={{ padding: "0 20px 20px 20px", color: "#555", fontSize: "0.95rem", lineHeight: "1.5" }}>
            <p style={{marginTop: 0}}><strong>Comment est calculé le Store Credit ?</strong></p>
            <ul style={{ paddingLeft: "20px", margin: "10px 0" }}>
                <li><strong>Règle :</strong> 10€ de crédit sont gagnés pour chaque tranche de 500€ de chiffre d'affaires généré.</li>
            </ul>
          </div>
        </details>
      </div>

      <div style={{ maxWidth: containerMaxWidth, margin: "0 auto" }}>
        <div style={{ backgroundColor: "white", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#fafafa" }}>
            <h2 style={{ margin: 0, color: "#444", fontSize: "1.1rem", fontWeight: "600" }}>Liste des Clients Pros ({clients.length})</h2>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1200px" }}>
              <thead>
                <tr style={{ backgroundColor: "white", borderBottom: "2px solid #eee" }}>
                  {/* GROUPE 1 : IDENTITÉ (45%) */}
                  <th style={{...thStyle, width: "20%"}}>Nom Pro</th>
                  <th style={{...thStyle, width: "20%"}}>Email</th>
                  <th style={{...thCenter, width: "5%"}}>Lien</th>
                  
                  {/* GROUPE 2 : CODE PROMO (10%) - VERT */}
                  <th style={{...thPromoStyle, width: "10%"}}>Code Promo</th>
                  
                  {/* GROUPE 3 : PERFORMANCE (17.5%) - BLEU */}
                  <th style={{...thPerfStyle, width: "7.5%"}}>Com.</th>
                  <th style={{...thPerfStyle, width: "10%"}}>CA Généré</th>
                  
                  {/* GROUPE 4 : CRÉDITS (27.5%) - VIOLET */}
                  <th style={{...thCreditStyle, width: "9%"}}>Gagné</th>
                  <th style={{...thCreditStyle, width: "9%"}}>Utilisé</th>
                  <th style={{...thCreditStyle, width: "9.5%", fontWeight: "800"}}>RESTANT</th>
                </tr>
              </thead>
              <tbody>
                {currentClients.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: "30px", textAlign: "center", color: "#888" }}>Aucun client avec le tag 'pro_sante' trouvé.</td></tr>
                ) : (
                  currentClients.map((client: any, i: number) => {
                    // Couleurs Alternées
                    const bgStd = i % 2 === 0 ? "white" : "#fafafa";
                    const bgPromo = i % 2 === 0 ? "#f7fbf9" : "#eef6f3"; // Vert Pâle
                    const bgPerf = i % 2 === 0 ? "#f0f8ff" : "#e6f2ff"; // Bleu Pâle
                    const bgCredit = i % 2 === 0 ? "#fcfaff" : "#f6f0fd"; // Violet Pâle
                    
                    // Bordures de séparation
                    const borderPromo = { borderLeft: "2px solid #e1e3e5" };
                    const borderPerf = { borderLeft: "2px solid #b8d0eb" };
                    const borderCredit = { borderLeft: "2px solid #e6dff0" };

                    return (
                      <tr key={client.id}>
                        {/* Identité */}
                        <td style={{ ...styles.cell, backgroundColor: bgStd }}>
                          <div style={{ fontWeight: "600", color: "#333", marginBottom: "4px" }}>{client.firstName} {client.lastName}</div>
                        </td>
                        <td style={{ ...styles.cell, backgroundColor: bgStd, color: "#666" }}>
                          {client.email}
                        </td>
                        <td style={{ ...styles.cellCenter, backgroundColor: bgStd }}>
                          <a href={`shopify:admin/customers/${extractId(client.id)}`} target="_top" style={styles.adminBtn} title="Voir le client">↗</a>
                        </td>

                        {/* Code Promo (Fond Vert + Badge Vert) */}
                        <td style={{ ...styles.cellPromo, backgroundColor: bgPromo, ...borderPromo }}>
                           {client.linkedCode !== "⚠️ Pas de lien" ? (
                             <span style={styles.badgeCode}>{client.linkedCode}</span>
                           ) : (
                             <span style={{ color: "#d82c0d", fontSize: "0.8rem", backgroundColor: "#fff0f0", padding: "2px 6px", borderRadius: "4px" }}>Non lié</span>
                           )}
                        </td>

                        {/* Performance (Fond Bleu + Texte Bleu) */}
                        <td style={{ ...styles.cellPerf, backgroundColor: bgPerf, ...borderPerf, fontWeight: "600", color: "#005bd3" }}>
                          {client.ordersCount}
                        </td>
                        <td style={{ ...styles.cellPerf, backgroundColor: bgPerf, fontWeight: "bold", color: "#005bd3" }}>
                          {client.totalRevenue.toFixed(2)} €
                        </td>

                        {/* Store Credit (Fond Violet) */}
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