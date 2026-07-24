import "./globals.css";

export const metadata = {
  title: "WhalesMarket — US & Korean equities terminal",
  description:
    "Bloomberg-style terminal for US and Korean stocks: live quotes, analyst estimates, and AI forecasts.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
