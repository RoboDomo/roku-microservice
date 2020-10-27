process.env.DEBUG = "RokuHost,HostBase";

process.title = process.env.TITLE || "roku-microservice";

const { RokuClient, Keys } = require("roku-client"),
  HostBase = require("microservice-core/HostBase"),
  dns = require("dns"),
  debug = require("debug")("RokuHost");

const TOPIC_ROOT = process.env.TOPIC_ROOT || "roku",
  MQTT_HOST = process.env.MQTT_HOST;

const isNewActivity = (newActivity, oldActivity) => {
  if (newActivity && oldActivity) {
    for (const key of Object.keys(newActivity)) {
      if (oldActivity[key] !== newActivity[key]) {
        return true;
      }
    }
    return false;
  }
  return newActivity != oldActivity;
};

class RokuHost extends HostBase {
  constructor(host, ip) {
    debug("construct RokuHost", host, ip);
    super(MQTT_HOST, `${TOPIC_ROOT}/${host}`);
    this.host = host;
    this.ip = ip;
    this.roku = new RokuClient(`http://${ip}:8060`);
    this.poll();
  }

  async pollApps() {
    try {
      let apps = await this.roku.apps();
      for (const a of apps) {
        a.icon = `http://${this.ip}:8060/query/icon/${a.id}`;
      }
      
      return apps;
    } catch (e) {
      console.log("pollApps exception", e);
      return false;
    }
  }

  async pollActive() {
    try {
      let active = await this.roku.active();
      if (active !== null) {
        active.icon = `http://${this.ip}:8060/query/icon/${active.id}`;
      }
      return active;
    } catch (e) {
      console.log("pollActive exception", e);
      return false;
    }
  }

  async pollInfo() {
    try {
      let info = await this.roku.info();
      return info;
    } catch (e) {
      console.log("pollInfo exception", e);
      return false;
    }
  }

  async poll() {
    this.state = { keys: Keys };
    for (;;) {
      const apps = await this.pollApps();
      if (apps !== false) {
        this.state = { apps: apps };
      }
      break;
    }

    for (;;) {
      const info = await this.pollInfo();
      if (info !== false) {
        this.state = { info: info };
      }
      break;
    }

    for (;;) {
      const active = await this.pollActive();
      if (isNewActivity(active, this.state.active)) {
        this.state = { active: active };
      }
      if (active !== false && active !== null) {
        this.state = {
          activeApp: active.name,
          activeIcon: active.icon,
          activeId: active.id,
        };
      } else {
        this.state = {
          activeApp: null,
          activeIcon: null,
          activeId: 0,
        };
      }

      const info = await this.pollInfo();
      if (info !== false) {
        this.state = {
          // info: isNewActivity(info, this.state.info) ? info : undefined,
          power: info.powerMode === "PowerOn"
        };
      }
      await this.wait(1000);
    }
  }

  command(topic, command) {
    console.log("topic", topic, "command", command);
    command = command.toUpperCase();
    if (command.substr(0, 7) === "LAUNCH-") {
      command = command.substr(7);
      console.log("LAUNCH ", command);
    }
    else {
      this.roku.keypress(command);
    }
  }
}

const rokus = {};

const main = async () => {
  console.log("keys", Keys);
  if (!MQTT_HOST) {
    console.log("ENV variable MQTT_HOST not found");
    process.exit(1);
  }
  const Config = await HostBase.config();

  const dnsPromises = dns.promises;
  // console.log(Config);
  // console.log(Config.roku);
  for (const roku of Config.roku.devices) {
    console.log(roku);
    const ip = await dnsPromises.lookup(roku.device);
    console.log(roku.device, ip.address);
    rokus[roku.name] = new RokuHost(roku.device, ip.address);
  }
  // if (!ROKU_HOSTS || !ROKU_HOSTS.length) {
  //   console.log("ENV variable DENON_HOSTS not found");
  //   process.exit(1);
  // }
  // for (const host of ROKU_HOSTS) {
  //   rokus[host] = new RokuHost(host);
  // }
};

main();
