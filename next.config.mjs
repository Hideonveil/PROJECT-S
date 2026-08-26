/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async redirects() {
    return [
      { source: "/", destination: "/index.html", permanent: false },
    ];
  },
};

export default nextConfig;
