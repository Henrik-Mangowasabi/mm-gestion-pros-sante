import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, Form, redirect } from "react-router";
import { Page, Layout, Card, Text, Banner, Button } from "@shopify/polaris";
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
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Rediriger pour recharger la page et vérifier à nouveau
    return redirect("/app");
  }
  
  return { result };
};

export default function Index() {
  const { status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <Page title="MM Gestion Pros Santé">
      <Layout>
        <Layout.Section>
          {actionData?.result?.error && (
            <Banner tone="critical" title="Erreur">
              <p>{actionData.result.error}</p>
            </Banner>
          )}
          
          {status.exists && (
            <Banner tone="success" title="Structure prête">
              <p>Le métaobjet &quot;MM Pro de santé&quot; existe. Structure prête !</p>
            </Banner>
          )}
          
          <Card>
            {status.exists ? (
              <Text as="p" variant="bodyMd">
                Structure prête
              </Text>
            ) : (
              <>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Le métaobjet &quot;MM Pro de santé&quot; n&apos;existe pas encore.
                </Text>
                <div style={{ marginTop: "1rem" }}>
                  <Form method="post">
                    <Button submit variant="primary" size="large">
                      Créer la structure
                    </Button>
                  </Form>
                </div>
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}