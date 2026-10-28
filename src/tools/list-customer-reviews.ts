import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listCustomerReviewsInput = z.strictObject({
  appId: resourceId,
  rating: z.number().int().min(1).max(5).optional(),
  territory: z.string().regex(/^[A-Z]{3}$/).optional(),
  sort: z.enum(['createdDate', '-createdDate']).default('-createdDate'), ...paginationInput,
});
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('customerReviews'),
    attributes: z.object({
      rating: z.number().int().min(1).max(5).nullable(),
      title: z.string().nullable(), body: z.string().nullable(),
      createdDate: z.string().nullable(), territory: z.string().nullable(),
    }),
  })).max(100),
  links: pageLinks,
});

export function createListCustomerReviews(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      items: response.data.data.map(({ id, attributes }) => ({ id, ...attributes })),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listCustomerReviewsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_customer_reviews arguments.');
    const { appId, rating, territory, sort, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/apps/${encodeURIComponent(appId)}/customerReviews`, limit, cursor, query: {
      'fields[customerReviews]': 'rating,title,body,createdDate,territory',
      sort,
      ...(rating === undefined ? {} : { 'filter[rating]': String(rating) }),
      ...(territory === undefined ? {} : { 'filter[territory]': territory }),
    } });
  };
}
