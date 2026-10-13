// Accept only a newly created Quick Tunnel hostname, never api.trycloudflare.com in errors.
export function tunnelOrigin(log){return log.match(/https:\/\/([a-z0-9]+(?:-[a-z0-9]+)+)\.trycloudflare\.com(?:\s|$|\/)/)?.[0]?.trim().replace(/\/$/,'')??null}
