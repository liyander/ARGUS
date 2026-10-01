import { createContext, lazy, useContext, type ComponentType, type LazyExoticComponent } from 'react';
import type { Analysis } from '../core/model';

export type ViewId = 'overview' | 'architecture' | 'dots' | 'galaxy' | 'endpoints' | 'dependencies' | 'treemap' | 'thirdparties';

export interface ViewDef {
  id: ViewId;
  label: string;
  /** keyboard shortcut */
  key: string;
  icon: string;
  modes: Analysis['mode'][];
  component: LazyExoticComponent<ComponentType>;
  /** fetch the view's code without rendering it (background prefetch) */
  load: () => Promise<unknown>;
}

function view(def: Omit<ViewDef, 'component' | 'load'>, load: () => Promise<{ default: ComponentType }>): ViewDef {
  return { ...def, load, component: lazy(load) };
}

/** Code-split: each view loads on first use. */
export const VIEWS: ViewDef[] = [
  view({ id: 'overview', label: 'Overview', key: '1', icon: 'overview', modes: ['repo', 'url'] }, () => import('./Overview')),
  view({ id: 'architecture', label: 'Architecture', key: '2', icon: 'architecture', modes: ['repo', 'url'] }, () => import('./ArchitectureMap')),
  view({ id: 'galaxy', label: 'Galaxy', key: '3', icon: 'galaxy', modes: ['repo'] }, () => import('./Galaxy')),
  view({ id: 'endpoints', label: 'Endpoints', key: '4', icon: 'endpoints', modes: ['repo', 'url'] }, () => import('./Endpoints')),
  view({ id: 'dependencies', label: 'Dependencies', key: '5', icon: 'dependencies', modes: ['repo', 'url'] }, () => import('./Dependencies')),
  view({ id: 'treemap', label: 'Treemap', key: '6', icon: 'treemap', modes: ['repo'] }, () => import('./Treemap')),
  view({ id: 'thirdparties', label: 'Third parties', key: '7', icon: 'thirdparties', modes: ['repo', 'url'] }, () => import('./ThirdParties')),
  view({ id: 'dots', label: 'Dots', key: '8', icon: 'dots', modes: ['repo', 'url'] }, () => import('./Dots')),
];

export const viewsFor = (mode: Analysis['mode']) => VIEWS.filter((v) => v.modes.includes(mode));

/** Download every view's code in the background, so switching never waits on the network. */
let prefetched = false;
export function prefetchViews() {
  if (prefetched) return;
  prefetched = true;
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 300));
  VIEWS.reduce<Promise<unknown>>((chain, v) => chain.then(() => new Promise((r) => idle(() => v.load().then(r, r)))), Promise.resolve());
}

/** True while a kept-alive view is the visible one; hidden views pause their render loops. */
export const ViewActiveContext = createContext(true);
export const useViewActive = () => useContext(ViewActiveContext);
