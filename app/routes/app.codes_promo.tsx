import { useLoaderData, Link, Form, useSubmit } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMetaobjectEntries, updateMetaobjectEntry } from "../lib/metaobject.server";

// --- LOADER ---
export const loader = async ({ request }: any) => {
  const { admin } = await authenticate.admin(request);
  const { entries } = await getMetaobjectEntries(admin);
  return { entries };
};

// --- ACTION (Pour gérer le clic sur Activer/Désactiver) ---
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const actionType = formData.get("action");
  const id = formData.get("id") as string;

  if (actionType === "toggle_status") {
    const newStatus = formData.get("new_status") === "true"; // Convertir en booléen
    
    // On met à jour uniquement le status dans le métaobjet (la logique server s'occupera de Shopify Discount)
    await updateMetaobjectEntry(admin, id, { status: newStatus });
    
    return { success: true };
  }
  
  return null;
};

// --- COMPOSANT PAGE ---
export default function CodesPromoPage() {
  const { entries } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const handleToggle = (id: string, currentStatus: boolean) => {
    // On envoie l'inverse du statut actuel
    submit(
      { action: "toggle_status", id, new_status: (!currentStatus).toString() },
      { method: "post" }
    );
  };

  return (
    <div style={{
      width: "100%",
      minHeight: "100vh",
      padding: "2rem",
      backgroundColor: "#f5f5f5",
      fontFamily: "Arial, sans-serif"
    }}>
      <h1 style={{ color: "#333", marginBottom: "2rem", textAlign: "center" }}>
        Vue d'ensemble des Codes Promo
      </h1>

      <div style={{ maxWidth: "1200px", margin: "0 auto", marginBottom: "2rem" }}>
        <div style={{ 
          padding: "1rem 2rem", 
          backgroundColor: "#fff", 
          borderLeft: "4px solid #008060",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          marginBottom: "2rem"
        }}>
          <p style={{ margin: 0, color: "#555" }}>
            Gérez ici l'activation de vos codes promo. <br/>
            Un code "Inactif" ne pourra pas être utilisé lors du paiement, mais reste lié au Pro.
          </p>
        </div>

        <div style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "1.5rem",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <h2 style={{ marginTop: 0, marginBottom: "1.5rem", color: "#333" }}>
            Liste des Codes ({entries.length})
          </h2>
          
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8f8f8" }}>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Nom du Pro</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Code Promo</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Valeur</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>Nom Technique</th>
                  <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #ddd" }}>État</th>
                  <th style={{ padding: "12px", textAlign: "right", borderBottom: "2px solid #ddd" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry: any, index: number) => {
                  const isActive = entry.status !== false; // Actif par défaut si undefined

                  return (
                    <tr key={entry.id} style={{
                      borderBottom: "1px solid #eee",
                      backgroundColor: index % 2 === 0 ? "white" : "#fafafa",
                      opacity: isActive ? 1 : 0.6 // Griser légèrement si inactif
                    }}>
                      <td style={{ padding: "12px", fontWeight: "bold" }}>{entry.name}</td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ 
                          backgroundColor: isActive ? "#e3f1df" : "#eee", 
                          color: isActive ? "#008060" : "#666", 
                          padding: "4px 8px", borderRadius: "4px", fontWeight: "600", fontFamily: "monospace"
                        }}>
                          {entry.code}
                        </span>
                      </td>
                      <td style={{ padding: "12px" }}>{entry.montant} {entry.type}</td>
                      <td style={{ padding: "12px", color: "#666", fontSize: "0.9em" }}>Code promo Pro Sante - {entry.name}</td>
                      <td style={{ padding: "12px" }}>
                        {entry.discount_id ? (
                           isActive ? (
                            <span style={{ color: "#008060", fontWeight: "bold" }}>● Actif</span>
                           ) : (
                            <span style={{ color: "#666", fontWeight: "bold" }}>○ Inactif</span>
                           )
                        ) : (
                          <span style={{ color: "#d82c0d" }}>Non lié</span>
                        )}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                         {entry.discount_id && (
                           <button
                             onClick={() => handleToggle(entry.id, isActive)}
                             style={{
                               padding: "6px 12px",
                               backgroundColor: isActive ? "#fff" : "#008060",
                               color: isActive ? "#d82c0d" : "#fff",
                               border: isActive ? "1px solid #d82c0d" : "none",
                               borderRadius: "4px",
                               cursor: "pointer",
                               fontWeight: "bold",
                               fontSize: "0.9em",
                               transition: "all 0.2s"
                             }}
                           >
                             {isActive ? "Désactiver" : "Activer"}
                           </button>
                         )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "30px" }}>
          <Link to="/app" style={{ 
            textDecoration: "none", color: "#008060", fontWeight: "bold",
            border: "1px solid #008060", padding: "10px 20px", borderRadius: "4px", backgroundColor: "white"
          }}>
            ← Retour à la gestion des Pros
          </Link>
        </div>
      </div>
    </div>
  );
}