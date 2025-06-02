import {
  ProductProjection,
  ProductProjectionPagedQueryResponse,
} from '@commercetools/platform-sdk';

import { createApiRoot as apiRoot } from '../client/create.client';
import { logger } from '../utils/logger.utils';

export async function fetchProductsUpdatedSince(
  storeKey: string
): Promise<ProductProjection[]> {
  const pageSize = 16;
  const updatedProductProjections: ProductProjection[] = [];

  let hasMorePages = true;
  let lastFetchedProductId: string | undefined = undefined;

  // Step 1: Fetch the last sync timestamp from the custom object
  let since: string = '1970-01-01T00:00:00Z'; // fallback if no custom object exists

  try {
    const customObjectResponse = await apiRoot()
      .customObjects()
      .withContainerAndKey({
        container: `${storeKey}_product_sync`,
        key: 'last_sync',
      })
      .get()
      .execute();

    since = customObjectResponse.body.value.syncedAt;

    logger.log({
      level: 'info',
      message: `🔄 Performing delta sync since: ${since}`,
    });
  } catch (err: any) {
    logger.error(
      err,
      'Failed to read last sync timestamp. Perform full sync first'
    );
    return [];
  }

  // Step 2: Scan through product assignments and fetch only updated projections
  while (hasMorePages) {
    const queryArgs: any = {
      limit: pageSize,
      withTotal: false,
      sort: ['product.id asc'],
      ...(lastFetchedProductId && {
        where: [`product(id > "${lastFetchedProductId}")`],
      }),
    };

    try {
      const assignmentResponse = await apiRoot()
        .inStoreKeyWithStoreKeyValue({ storeKey })
        .productSelectionAssignments()
        .get({ queryArgs })
        .execute();

      const assignedProductIds = assignmentResponse.body.results.map(
        (assignment) => assignment.product.id
      );

      if (assignedProductIds.length > 0) {
        lastFetchedProductId =
          assignedProductIds[assignedProductIds.length - 1];
      }

      for (const productId of assignedProductIds) {
        try {
          const projectionResponse = await apiRoot()
            .inStoreKeyWithStoreKeyValue({ storeKey })
            .productProjections()
            .withId({ ID: productId })
            .get()
            .execute();

          const projection = projectionResponse.body;

          if (projection.lastModifiedAt > since) {
            updatedProductProjections.push(projection);
          }
        } catch (err) {
          logger.error(
            `Failed to fetch product projection for ID: ${productId}`
          );
        }
      }

      hasMorePages = assignedProductIds.length === pageSize;
    } catch (err) {
      logger.error('Failed to fetch product assignments');
      hasMorePages = false;
    }
  }

  // Step 3: Update the custom object with the new timestamp
  const now = new Date().toISOString();

  try {
    await apiRoot()
      .customObjects()
      .post({
        body: {
          container: `${storeKey}_product_sync`,
          key: 'last_sync',
          value: { syncedAt: now },
        },
      })
      .execute();

    logger.info(`✅ Delta sync timestamp updated: ${now}`);
  } catch (err) {
    logger.error('Failed to update sync timestamp');
  }

  return updatedProductProjections;
}
