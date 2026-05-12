export const config = {
  katana: {
    token: process.env.KATANA_TOKEN || 'b7d33d44-4f2d-45f1-91c0-de8cb96294b0',
    baseUrl: 'https://api.katanamrp.com/v1'
  },
  dm01: {
    server: process.env.DM01_SERVER || '192.168.128.53',
    database: process.env.DM01_DATABASE || 'DM01',
    username: process.env.DM01_USERNAME || 'powerbi',
    password: process.env.DM01_PASSWORD || '0R9nF&sNh9cs@Ua'
  },
  dm03: {
    server: process.env.DM03_SERVER || '192.168.128.53',
    database: process.env.DM03_DATABASE || 'DM03',
    username: process.env.DM03_USERNAME || 'powerbi',
    password: process.env.DM03_PASSWORD || '0R9nF&sNh9cs@Ua'
  },
  famous: {
    soapUrl: 'http://10.200.1.6/FamousWebServices/Famous.asmx',
    username: 'SIZERIMPORT',
    password: 'FAPI',
    company: 'COBBLESTONE FRUIT'
  },
  relay: {
    baseUrl: process.env.RELAY_URL || 'http://192.168.128.233:9000',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10)
  },
  defaultLocationId: 166637
};
