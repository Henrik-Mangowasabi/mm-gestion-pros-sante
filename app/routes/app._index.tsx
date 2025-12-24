import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import {
  Page, Layout, Card, Tabs, Button, Text, BlockStack, ResourceList, ResourceItem, Badge, Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // 1. Vérifier si le Metaobject "mm_pro_de_sante" existe
  const checkMO = await admin.graphql(`
    #graphql
    query {
      metaobjectDefinitionByType(type: "mm_pro_de_sante") {
        id
      }
    }
  `);
  
  const moData = await checkMO.json();
  const moExists = moData.data.metaobjectDefinitionByType !== null;

  // 2. Récupérer les données existantes
  const response = await admin.graphql(`
    #graphql
    query {
      metaobjects(type: "mm_pro_de_sante", first: 20) {
        nodes {
          id
          displayName
          fields { key value }
        }
      }
      discountNodes(first: 10) {
        nodes {
          id
          discount { ... on DiscountCodeBasic { title status } }
        }
      }
      customers(first: 20, query: "tag:PRO") {
        nodes { id displayName email }
      }
    }
  `);

  const data = await response.json();

  return json({
    moExists,
    pros: data.data.metaobjects?.nodes || [],
    discounts: data.data.discountNodes?.nodes || [],
    customers: data.data.customers?.nodes || [],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_structure") {
    const createRes = await admin.graphql(`
      #graphql
      mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { name type }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        definition: {
          name: "MM Pro de santé",
          type: "mm_pro_de_sante",
          access: { storefront: "PUBLIC_READ" },
          fieldDefinitions: [
            { name: "Identification", key: "identification", type: "single_line_text_field" },
            { name: "Name", key: "name", type: "single_line_text_field" },
            { name: "Email", key: "email", type: "single_line_text_field" },
            { name: "Code Name", key: "code", type: "single_line_text_field" },
            { name: "Montant", key: "montant", type: "number_decimal" },
            { 
              name: "Type", 
              key: "type", 
              type: "single_line_text_field",
              validations: [{ name: "choices", value: "[\\"%\\", \\"€\\"]" }]
            }
          ]
        }
      }
    });

    const result = await createRes.json();
    return json({ result });
  }
  return null;
};

export default function Index() {
  const { moExists, pros, discounts, customers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedTab, setSelectedTab] = useState(0);

  const isLoading = navigation.state === "submitting";

  const tabs = [
    { id: 'pros', content: 'Pros (Metaobjects)' },
    { id: 'codes', content: 'Codes Promo' },
    { id: 'segments', content: 'Segments (Tag PRO)' },
  ];

  return (
    <Page title="Gestion Pros Jolly Mama">
      <Layout>
        <Layout.Section>
          {!moExists && (
            <Banner title="Structure manquante" tone="warning" onDismiss={() => {}}>
              <BlockStack gap="200">
                <Text as="p">Le Metaobject <b>mm_pro_de_sante</b> n'est pas détecté.</Text>
                <Button 
                  onClick={() => submit({ intent: "create_structure" }, { method: "post" })}
                  loading={isLoading}
                  variant="primary"
                >
                  Créer la structure automatiquement
                </Button>
              </BlockStack>
            </Banner>
          )}

          <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
            <Card padding="500">
              {selectedTab === 0 && (
                <ResourceList
                  resourceName={{ singular: 'pro', plural: 'pros' }}
                  items={pros}
                  renderItem={(item: any) => (
                    <ResourceItem id={item.id} onClick={() => {}}>
                      <Text as="h3" variant="bodyMd" fontWeight="bold">{item.displayName}</Text>
                      <Text as="p" tone="subdued">Code: {item.fields.find((f:any) => f.key === 'code')?.value}</Text>
                    </ResourceItem>
                  )}
                />
              )}
              {/* Vues Codes Promo et Clients similaires... */}
            </Card>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}