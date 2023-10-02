# layout

- config: defaults to /home/user/.config/aft
- data: defaults to home/user/.local/shared/aft
- keepass file => {data}/etc/aft/aft.kdbx
- keepass key => {config}/aft.key
- age file => {config}.age.key
- age public file = > {config}.publicKey.txt

data has the following sub folders:

- `etc`
- `etc/aft`
- `etc/aft/<service>` this is where the compose and env files are
- `etc/<service>`
- `var/log/<service>`
- `var/cache/<service>`
- `var/tmp/<service>`
