import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (shop) {
    await prisma.session.deleteMany({ where: { shop } });
    console.log(`Sessions deleted for shop: ${shop}`);
  }

  return new Response();
};
