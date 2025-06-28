# WinBoat

Windows for Penguins.

## ⚠️ Work in Progress ⚠️

WinBoat is currently nowhere near stable, however the repository is now public considering the amount of testers that have shown interest in this project, which I'm very thankful for. 

That being said, I **strongly discourage you** from trying WinBoat for now unless you are comfortable with troubleshooting, and/or modifying the code.

### Known Issues About Container Runtimes
- Podman is **unsupported** for now
- Docker Desktop is **unsupported** for now
- Distros that emulate Docker through a Podman socket are **unsupported**
- Any rootless containerization solution is currently **unsupported**

### How to run WinBoat:
- Make sure you have Docker and Docker Compose V2 installed and configured, you follow see the steps [here](https://docs.docker.com/engine/install/)
- Create the `docker` usergroup and add your user to it
    - `sudo groupadd docker`
    - `sudo usermod -aG docker $USER`
    - `sudo reboot now` - Reboot the system
- Make sure you have Node and NPM installed (`brew install node` - or use your distro's package manager)
- Make sure you have the correct kernel modules loaded for iptables (`echo -e "ip_tables\niptable_nat" | sudo tee /etc/modules-load.d/iptables.conf` and restart your machine)
- Clone the repo (`git clone https://github.com/TibixDev/WinBoat`)
- Install the dependencies (`npm i`)
- Run the app (`npm run dev`)