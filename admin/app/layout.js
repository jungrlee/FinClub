import "./globals.css";

export const metadata = {
  title: "WhalesMarket Admin",
  description: "Fund manager competition admin console",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
