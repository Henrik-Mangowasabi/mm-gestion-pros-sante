import { useLoaderData, Link, useFetcher } from "react-router"; // <-- IMPORTANT: useFetcher
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMetaobjectEntries, updateMetaobjectEntry } from "../lib/metaobject.server";

export const loader = async ({ request }: any) => {
  const { admin } = await authenticate.admin(request);
  const { entries } = await getMetaobjectEntries(admin);
  return { entries };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const actionType = formData.get("action");
  const id = formData.get("id") as string;

  if (actionType === "toggle_status") {
    // Conversion stricte pour être sûr
    const newStatus = formData.get("new_status") === "true";
    
    // On met à jour le métaobjet
    const result = await updateMetaobjectEntry(admin, id, { status: newStatus });
    
    if (result.success) return { success: true };
    return { success: false, error: result.error };
  }
  return null;
};

export default function CodesPromoPage() {
  const { entries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher(); // <-- On initialise le fetcher

  return (
    <div style={{ width: "100%", minHeight: "100vh", padding: "2rem", backgroundColor: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ color: "#333", marginBottom: "2rem", textAlign: "center" }}>Vue d'ensemble des Codes Promo</h1>

      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "1.5rem", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
          <h2 style={{ marginTop: 0, marginBottom: "1.5rem", color: "#333" }}>Liste des Codes ({entries.length})</h2>
          
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8f8f8" }}>
                <th style={{ padding: "12px", textAlign: "left" }}>Nom</th>
                <th style={{ padding: "12px", textAlign: "left" }}>Code</th>
                <th style={{ padding: "12px", textAlign: "left" }}>État</th>
                <th style={{ padding: "12px", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: any, index: number) => {
                // --- LOGIQUE MAGIQUE (Optimistic UI) ---
                // Si on est en train de cliquer, on affiche le futur état immédiatement
                const isChanging = fetcher.formData?.get("id") === entry.id;
                let isActive = entry.status !== false; // Valeur réelle
                
                if (isChanging) {
                    isActive = fetcher.formData.get("new_status") === "true"; // Valeur future simulée
                }

                return (
                  <tr key={entry.id} style={{ borderBottom: "1px solid #eee", opacity: isActive ? 1 : 0.6 }}>
                    <td style={{ padding: "12px", fontWeight: "bold" }}>{entry.name}</td>
                    <td style={{ padding: "12px" }}>
                        <span style={{ backgroundColor: isActive ? "#e3f1df" : "#eee", color: isActive ? "#008060" : "#666", padding: "4px 8px", borderRadius: "4px" }}>
                            {entry.code}
                        </span>
                    </td>
                    <td style={{ padding: "12px" }}>
                      {isActive ? <span style={{color:"#008060"}}>● Actif</span> : <span style={{color:"#666"}}>○ Inactif</span>}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                       {/* On utilise fetcher.Form au lieu de Form classique */}
                       <fetcher.Form method="post">
                         <input type="hidden" name="action" value="toggle_status" />
                         <input type="hidden" name="id" value={entry.id} />
                         {/* On envoie l'INVERSE de l'état actuel */}
                         <input type="hidden" name="new_status" value={(!isActive).toString()} />
                         
                         <button type="submit" style={{ 
                             padding: "6px 12px", 
                             cursor: "pointer",
                             backgroundColor: isActive ? "white" : "#008060",
                             color: isActive ? "#d82c0d" : "white",
                             border: isActive ? "1px solid #d82c0d" : "none",
                             borderRadius: "4px"
                         }}>
                           {isActive ? "Désactiver" : "Activer"}
                         </button>
                       </fetcher.Form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div style={{ textAlign: "center", marginTop: "20px" }}>
            <Link to="/app" style={{ textDecoration: "none", color: "#008060" }}>← Retour à la gestion des Pros</Link>
        </div>
      </div>
    </div>
  );
}