const { app } = require("./src/app");
const { env } = require("./src/config/env");

app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
});

