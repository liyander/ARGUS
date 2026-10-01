import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { CommandPalette } from './components/CommandPalette';
import { DotGrid } from './components/DotGrid';
import { TokenDialog } from './components/TokenDialog';
import { TopBar } from './components/TopBar';
import { Landing } from './pages/Landing';

const Results = lazy(() => import('./pages/Results'));
const Compare = lazy(() => import('./pages/Compare'));
const Gallery = lazy(() => import('./pages/Gallery'));
const About = lazy(() => import('./pages/About'));

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DotGrid />
      <div className="relative flex min-h-full flex-col">
        <TopBar />
        <Suspense fallback={<div className="flex-1" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/r/:owner/:repo/*" element={<Results mode="repo" />} />
            <Route path="/u/*" element={<Results mode="url" />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/about" element={<About />} />
            <Route path="/terms" element={<About section="terms" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
      <CommandPalette />
      <TokenDialog />
    </MotionConfig>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <div className="mono text-sm text-accent">404</div>
      <h1 className="text-3xl font-semibold">Nothing mapped here</h1>
      <p className="text-muted">That page doesn&apos;t exist. Try analyzing a repo from the home page.</p>
      <a href="/" className="mt-2 rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink">Go home</a>
    </div>
  );
}
