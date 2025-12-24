import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Tabs, Button, Text, BlockStack, ResourceList, ResourceItem, Badge, Banner, Box
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // 1. Vérification simplifiée du Metaobject
    const checkMO = await admin.graphql(`
      query {
        metaobjectDefinitionByType(type: "mm_pro_de_sante") {
          id
        }
      }
    `);
    const moData: any = await checkMO.json();
    const moExists = !!moData.data?.metaobjectDefinitionByType;

    // 2. Récupération des données (Pros, Codes, Clients)
    const response = await admin.graphql(`
      query {
        metaobjects(type: "mm_pro_de_sante", first: 10) {
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
        customers(first: 10, query: "tag:PRO") {
          nodes { id displayName email }
        }
      }
    `);
    const data: any = await response.json();

    return json({
      moExists,
      pros: data.data?.metaobjects?.nodes || [],
      discounts: data.data?.discountNodes?.nodes || [],
      customers: data.data?.customers?.nodes || [],
    });
  } catch (error) {
    // Si la requête échoue (ex: pas encore de droits), on renvoie des tableaux vides
    return json({ moExists: false, pros: [], discounts: [], customers: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("intent") === "create_structure") {
    await admin.graphql(`
      mutation CreateDef($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { type }
          userErrors { message }
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
  }
  return json({ ok: true });
};

export default function Index() {
  const { moExists, pros, discounts, customers } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedTab, setSelectedTab] = useState(0);

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
            <Banner title="Structure manquante" tone="warning">
              <BlockStack gap="200">
                <Text as="p">Le Metaobject <b>mm_pro_de_sante</b> doit être configuré.</Text>
                <Button 
                  onClick={() => submit({ intent: "create_structure" }, { method: "post" })}
                  loading={navigation.state === "submitting"}
                  variant="primary"
                >
                  Créer la structure automatiquement
                </Button>
              </BlockStack>
            </Banner>
          )}

          <Card padding="0">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              <Box padding="400">
                {selectedTab === 0 && (
                  <ResourceList
                    resourceName={{ singular: 'pro', plural: 'pros' }}
                    items={pros}
                    renderItem={(item: any) => (
                      <ResourceItem id={item.id} onClick={() => {}}>
                        <Text as="h3" variant="bodyMd" fontWeight="bold">{item.displayName}</Text>
                        <Text as="p" tone="subdued">
                          Code: {item.fields?.find((f:any) => f.key === 'code')?.value || 'N/A'}
                        </Text>
                      </ResourceItem>
                    )}
                  />
                )}

                {selectedTab === 1 && (
                  <ResourceList
                    resourceName={{ singular: 'code', plural: 'codes' }}
                    items={discounts}
                    renderItem={(item: any) => (
                      <ResourceItem id={item.id} onClick={() => {}}>
                        <Text as="h3" variant="bodyMd" fontWeight="bold">{item.discount?.title || "Promo"}</Text>
                        <Badge tone={item.discount?.status === 'ACTIVE' ? 'success' : 'attention'}>
                          {item.discount?.status || 'Inactif'}
                        </Badge>
                      </ResourceItem>
                    )}
                  />
                )}

                {selectedTab === 2 && (
                  <ResourceList
                    resourceName={{ singular: 'client', plural: 'clients' }}
                    items={customers}
                    renderItem={(item: any) => (
                      <ResourceItem id={item.id} onClick={() => {}}>
                        <Text as="h3" variant="bodyMd" fontWeight="bold">{item.displayName}</Text>
                        <Text as="p" tone="subdued">{item.email}</Text>
                      </ResourceItem>
                    )}
                  />
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}