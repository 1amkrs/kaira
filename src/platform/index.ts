import { IPlatformAdapter } from './types';
import { createPlatformAdapter } from './factory';

export * from './types';

export const platform: IPlatformAdapter = createPlatformAdapter();
