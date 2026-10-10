// The Oatcake wordmark. Swap in the real logo by setting LOGO to its file in public/.
const LOGO: string | null = "/brands/oatcake.svg";

export default function OatcakeLogo({ height = 48 }: { height?: number }) {
  if (LOGO) return <img src={LOGO} alt="Oatcake" style={{ height, width: "auto", display: "block" }} />;
  return (
    <span className="oatcake-word" style={{ fontSize: height * 0.9 }}>
      oatcake
    </span>
  );
}
