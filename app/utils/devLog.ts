/* eslint-disable no-console */
import { isDev } from '../../utils.ts';

export function devWarning(component: string, message: string): void {
  if (isDev) {
    console.warn(`[rn-vant: ${component}] ${message}`);
  }
}
