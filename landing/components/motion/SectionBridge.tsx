type SectionBridgeProps = {
  tone: 'privacy-safety' | 'faq-coming';
  id: string;
};

export function SectionBridge({ tone, id }: SectionBridgeProps) {
  const gradientId = `bridge-gradient-${id}`;

  return (
    <div className={`section-bridge section-bridge--${tone}`} data-section-bridge aria-hidden="true">
      <div className="section-bridge__halo" data-bridge-halo />
      <svg viewBox="0 0 1440 240" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1">
            <stop offset="0" stopColor="#3B82F6" />
            <stop offset="0.5" stopColor="#41C08D" />
            <stop offset="1" stopColor="#E0A23E" />
          </linearGradient>
        </defs>
        <path className="section-bridge__ghost" d="M-30 165 C 235 42, 390 218, 690 112 S 1150 26, 1470 135" />
        <path data-bridge-path stroke={`url(#${gradientId})`} d="M-30 165 C 235 42, 390 218, 690 112 S 1150 26, 1470 135" />
      </svg>
      <span className="section-bridge__node section-bridge__node--open" data-bridge-node />
      <span className="section-bridge__node section-bridge__node--now" data-bridge-node />
      <span className="section-bridge__node section-bridge__node--soon" data-bridge-node />
    </div>
  );
}
