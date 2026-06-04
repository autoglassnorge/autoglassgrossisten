import { VehicleWizard } from '../search/VehicleWizard';

export function HeroSearch() {
  return (
    <div className="w-full max-w-2xl">
      <VehicleWizard />

      {/* Helper micro-text */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-carbon-500 uppercase tracking-wider">
        <span>· SVV oppslag</span>
        <span>· Merke / modell / år</span>
        <span>· Produktmatching</span>
      </div>
    </div>
  );
}
