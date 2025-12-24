import { Page, Layout, Card, Text } from "@shopify/polaris";

export default function Index() {
  return (
    <Page title="App créé">
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="p" variant="bodyMd">
              App créé
            </Text>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}