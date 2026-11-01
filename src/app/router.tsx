import { createBrowserRouter } from 'react-router';
import { createRoutes } from './routing/routes.tsx';
import { queryClient } from './query-client.ts';

export const router = createBrowserRouter(createRoutes(queryClient));
