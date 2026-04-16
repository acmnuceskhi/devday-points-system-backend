// Force IPv4 DNS resolution: Railway containers have no IPv6 routing,
// so without this smtp.gmail.com resolves to an IPv6 address and all
// outbound SMTP connections fail with ENETUNREACH.
require("dns").setDefaultResultOrder("ipv4first");

const { app } = require("./src/app");
const { env } = require("./src/config/env");

app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API listening on http://0.0.0.0:${env.PORT}`);
});

