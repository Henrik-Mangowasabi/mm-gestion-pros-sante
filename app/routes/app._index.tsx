import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { Page, Layout, Card, Text, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ensureMetaobjectExists } from "../lib/metaobject.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  const metaobjectStatus = await ensureMetaobjectExists(admin);
  
  return { metaobjectStatus };
};

export default function Index() {
  const { metaobjectStatus } = useLoaderData<typeof loader>();

  return (
    <Page title="MM Gestion Pros Santé">
      <Layout>
        <Layout.Section>
          {metaobjectStatus.error && (
            <Banner tone="critical" title="Erreur">
              <p>{metaobjectStatus.error}</p>
            </Banner>
          )}
          
          {metaobjectStatus.created && (
            <Banner tone="success" title="Métaobjet créé">
              <p>Le métaobjet &quot;MM Pro de santé&quot; a été créé avec succès !</p>
            </Banner>
          )}
          
          {metaobjectStatus.exists && (
            <Banner tone="info" title="Métaobjet existant">
              <p>Le métaobjet &quot;MM Pro de santé&quot; existe déjà.</p>
            </Banner>
          )}
          
          <Card>
            <Text as="p" variant="bodyMd">
              {metaobjectStatus.exists 
                ? "Le métaobjet est prêt à être utilisé." 
                : metaobjectStatus.created 
                ? "Le métaobjet vient d'être créé et est prêt à être utilisé."
                : "Vérification du métaobjet en cours..."}
            </Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}