# Aft

Aft aims to make it easier to setup docker environments, home lab or self host software with just vanilla
docker.

Aft may grow into a docker compose package manager.

Aft uses handlebars and keepass to enable docker compose templates with the ability to dynamically generate secrets as
needed for services in docker compose files.



## Install

Use deno to install the cli as a named script by
running `deno install --unstable -qAn aft "https://deno.land/x/aft@{VERSION}/cli.ts"`
where `{VERSION}` is a specific version number that has been released.

To install qtr, run:

```bash
deno install --unstable -qAn aft "https://deno.land/x/aft@{VERSION}/cli.ts"
```

To uninstall qtr, run:

```bash
deno uninstall aft
```

## ENV VARS

- AFT_CONFIG_DIR
- AFT_DATA_DIR

## LICENSE

MIT.
