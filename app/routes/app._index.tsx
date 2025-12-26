import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, Form, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { checkMetaobjectStatus, createMetaobject } from "../lib/metaobject.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const status = await checkMetaobjectStatus(admin);
  return { status };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const result = await createMetaobject(admin);
  
  if (result.success) {
    // Attendre un peu pour que Shopify propage la création
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Recharger la page
    return redirect("/app");
  }
  
  return { error: result.error || "Erreur lors de la création" };
};

export default function Index() {
  const { status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div style={{
      width: "100%",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "#f5f5f5",
      fontFamily: "Arial, sans-serif"
    }}>
      <h1 style={{ color: "#333", marginBottom: "2rem" }}>app page web</h1>
      
      {actionData?.error && (
        <div style={{
          padding: "1rem",
          marginBottom: "1rem",
          backgroundColor: "#fee",
          color: "#c33",
          borderRadius: "4px"
        }}>
          Erreur : {actionData.error}
        </div>
      )}
      
      {status.exists ? (
        <div style={{
          padding: "1rem 2rem",
          backgroundColor: "#efe",
          color: "#3a3",
          borderRadius: "4px",
          fontSize: "1.2rem"
        }}>
          Structure créée !
        </div>
      ) : (
        <Form method="post">
          <button
            type="submit"
            style={{
              padding: "12px 24px",
              fontSize: "1rem",
              backgroundColor: "#008060",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "500"
            }}
          >
            Créer structure
          </button>
        </Form>
      )}
    </div>
  );
}