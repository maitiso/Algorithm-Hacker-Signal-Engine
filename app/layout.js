import "./globals.css";

export const metadata = {
  title: "Algorithm Hacker — Signal Engine",
  description:
    "Real-time Deriv signal generation engine"
};

export default function RootLayout({
  children
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}