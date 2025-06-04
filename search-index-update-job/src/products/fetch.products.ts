/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProductProjection } from '@commercetools/platform-sdk';

import { createApiRoot as apiRoot } from '../client/create.client';
import { logger } from '../utils/logger.utils';

export async function fetchRecentlyUpdatedProductsAcrossStores(): Promise<
  Object[]
> {
  type StoreProductRecord = {
    productId: string;
    storeKey: string;
    projection: ProductProjection;
  };

  const results: StoreProductRecord[] = [];
  const pageSize = 20;

  // ⏱️ Adjustable delta window (in minutes)
  const deltaMinutes = 10;

  // Calculate the time window
  const now = new Date();
  const from = new Date(now.getTime() - deltaMinutes * 60 * 1000);
  const fromTimestamp = from.toISOString();
  const toTimestamp = now.toISOString();

  let hasMore = true;
  let lastModifiedAtCursor = fromTimestamp;
  let lastIdCursor = '';

  const updatedProductIds: string[] = [];

  // Step 1: Fetch product IDs modified within the time window using GraphQL
  while (hasMore) {
    const whereClause = `
      where: "lastModifiedAt >= \\"${lastModifiedAtCursor}\\" AND lastModifiedAt <= \\"${toTimestamp}\\""
    `;

    const query = `
      query {
        products(limit: ${pageSize}, sort: ["lastModifiedAt asc", "id asc"], ${whereClause}) {
          results {
            id
            lastModifiedAt
          }
        }
      }
    `;

    const response = await apiRoot()
      .graphql()
      .post({ body: { query } })
      .execute();

    const products = response.body.data.products.results;

    if (!products.length) break;

    for (const product of products) {
      updatedProductIds.push(product.id);
    }

    const lastProduct = products[products.length - 1];
    lastModifiedAtCursor = lastProduct.lastModifiedAt;
    lastIdCursor = lastProduct.id;

    hasMore = products.length === pageSize;
  }

  // Step 2: Get all store keys
  const storeResponse = await apiRoot()
    .stores()
    .get({ queryArgs: { limit: 500 } })
    .execute();

  const storeKeys = storeResponse.body.results.map((store) => store.key);

  // Step 3: Fetch projections for updated products in available stores
  for (const productId of updatedProductIds) {
    for (const storeKey of storeKeys) {
      try {
        const result = await apiRoot()
          .inStoreKeyWithStoreKeyValue({ storeKey })
          .productProjections()
          .withId({ ID: productId })
          .get()
          .execute();

        results.push({
          productId,
          storeKey,
          projection: result.body,
        });
      } catch (error: any) {
        if (error.statusCode !== 404) {
          console.error(
            `Error checking product ${productId} in store ${storeKey}`,
            error
          );
        }
      }
    }
  }

  return results;
}
