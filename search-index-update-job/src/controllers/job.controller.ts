import { Request, Response } from 'express';

import CustomError from '../errors/custom.error';
import { logger } from '../utils/logger.utils';
import { allOrders } from '../orders/fetch.orders';
import { fetchProductsUpdatedSince } from '../products/fetch.products';
import { readConfiguration } from '../utils/config.utils';

/**
 * Exposed job endpoint.
 *
 * @param {Request} _request The express request
 * @param {Response} response The express response
 * @returns
 */
export const post = async (_request: Request, response: Response) => {
  try {
    // Get the orders
    const limitedOrdersObject = await fetchProductsUpdatedSince(
      readConfiguration().storeKey
    );
    logger.info(`Exported ${limitedOrdersObject.length} products!`);

    response.status(200).send();
  } catch (error) {
    throw new CustomError(
      500,
      `Internal Server Error - Error retrieving all orders from the commercetools SDK`
    );
  }
};
