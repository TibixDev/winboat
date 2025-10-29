export type App = {
    name: string;
    package: string;
    icon?: string;
};

export type Category = {
    category: string;
    apps: App[];
};

export type AppGroup = Category[];

export const appGroups: AppGroup = [
    {
        category: "Browsers",
        apps: [
            { name: "Mozilla Firefox", package: "firefox", icon: "logos:firefox" },
            { name: "Google Chrome", package: "googlechrome", icon: "devicon:chrome" },
            { name: "Chromium", package: "chromium", icon: "openmoji:chromium" },
            { name: "Ungoogled Chromium", package: "ungoogled-chromium", icon: "openmoji:chromium" },
            { name: "Vivaldi", package: "vivaldi", icon: "logos:vivaldi-icon" },
            { name: "Opera", package: "opera", icon: "logos:opera" },
            { name: "Brave", package: "brave", icon: "logos:brave" },
        ],
    },
    {
        category: "Messaging & Communication",
        apps: [
            { name: "Discord", package: "discord.install", icon: "skill-icons:discord" },
            { name: "Slack", package: "slack", icon: "devicon:slack" },
            { name: "Zoom", package: "zoom", icon: "logos:zoom-icon" },
            { name: "Skype", package: "skype", icon: "logos:skype" },
            {
                name: "Thunderbird",
                package: "thunderbird",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstyles.redditmedia.com%2Ft5_2rlpd%2Fstyles%2FcommunityIcon_4dcb9pmkpeab1.png&f=1&nofb=1&ipt=97e7e338fc944776460f3618cc13d13716c3a767484350f29e0fe3d50e05f273&ipo=images",
            },
        ],
    },
    {
        category: "Security",
        apps: [
            {
                name: "Bitwarden",
                package: "bitwarden",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F3053%2FPNG%2F512%2Fbitwarden_alt_macos_bigsur_icon_190338.png&f=1&nofb=1&ipt=255f72a190d220e8cb42fd6b132681b85a06394081910b49a929174574e4ee67&ipo=images",
            },
            {
                name: "KeePassXC",
                package: "keepassxc",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Fkeepassxc-icon-512x512-kzzncwc1.png&f=1&nofb=1&ipt=f93c36d6720fffac9c208152d93748c38832f42c3653e70141f88be1b4deb22e&ipo=images",
            },
            {
                name: "Keepass",
                package: "keepass",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.iconscout.com%2Ficon%2Ffree%2Fpng-256%2Fkeepass-2-569209.png&f=1&nofb=1&ipt=1eab53feab4cc9d416db944b2a68ac827f1b36d40dc2d702585502e3a2b12973&ipo=images",
            },
            {
                name: "QtPass",
                package: "qtpass",
                icon: "https://static-00.iconduck.com/assets.00/qtpass-icon-238x256-6qcu49g5.png",
            },
            {
                name: "LastPass",
                package: "lastpass",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Flastpass-icon-2048x2048-htiy2zmt.png&f=1&nofb=1&ipt=9d0dc6538a7527618160f94dc0d0e2a21fe0ad1873ba11e830ea4f3091d7c328&ipo=images",
            },
            {
                name: "OpenVPN",
                package: "openvpn",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.iconscout.com%2Ficon%2Ffree%2Fpng-512%2Fopenvpn-2-569521.png&f=1&nofb=1&ipt=d43b77286d60bf5e1e48a3f14ba046fe68602e20155cf991edb29e2a034dcd29&ipo=images",
            },
            {
                name: "Tailscale",
                package: "tailscale",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn-1.webcatalog.io%2Fcatalog%2Ftailscale%2Ftailscale-icon.png&f=1&nofb=1&ipt=61b09d839e7a5ed4f057bc427b5c3bab61c8b7358a39d54ab7d8c6283ed4ea43&ipo=images",
            },
            {
                name: "WireGuard",
                package: "wireguard",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Fwireguard-icon-512x512-vapigtol.png&f=1&nofb=1&ipt=5b3dca874d4cce21c6bbd63214f24d2810cb3df01ec3e1d8a89af1bef7ff9fc3&ipo=images",
            },
        ],
    },
    {
        category: "Media",
        apps: [
            { name: "Spotify", package: "spotify", icon: "logos:spotify-icon" },
            {
                name: "iTunes",
                package: "itunes",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn2.iconfinder.com%2Fdata%2Ficons%2Fios7-inspired-mac-icon-set%2F1024%2Fitunes_5122x.png&f=1&nofb=1&ipt=e9629b7110ae831d4f472381851bca71f93665bf911785e6b980c02751a66c51&ipo=images",
            },
            { name: "VLC", package: "vlc", icon: "flat-color-icons:vlc" },
            {
                name: "foobar2000",
                package: "foobar2000",
                icon: "https://external-content.duckduckgo.com/iu/?u=http%3A%2F%2Fwww.icons101.com%2Ficon_png%2Fsize_128%2Fid_83745%2FFoobar_iTunes.png&f=1&nofb=1&ipt=0918d1f23a0a5b88f6cde5a56dcc5c070ce1c971a4803db0e287435bce4ddf6a&ipo=images",
            },
            {
                name: "MPC-HC",
                package: "mpc-hc",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F112%2FPNG%2F512%2Fmpc_hc_18911.png&f=1&nofb=1&ipt=5c6edcfe27677a859c486b9f4b3d88d93e6f981dfa6307984dd60732c86f0498&ipo=images",
            },
            {
                name: "K-Lite Codec Pack (Full)",
                package: "k-litecodecpackfull",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.iconshock.com%2Fimage%2FClean%2FVideo_production%2Fk_lite&f=1&nofb=1&ipt=2078274a0bcbc3f414c799d8259f6d855013fb84602601bd3f122ec3f238807f&ipo=images",
            },
            {
                name: "Handbrake",
                package: "handbrake",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Fhandbrake-icon-1725x2048-wxmib6j0.png&f=1&nofb=1&ipt=f4afca9cfce11a128d2553c5927f6ff3ccf26844ea313aef82939a89a44ff996&ipo=images",
            },
            {
                name: "FFmpeg",
                package: "ffmpeg",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F3053%2FPNG%2F512%2Fffmpeg_macos_bigsur_icon_190192.png&f=1&nofb=1&ipt=e531b6623adf27e5473f8392b3c65c7fa58da3157b84b78f77530a401b26e0f6&ipo=images",
            },
        ],
    },
    {
        category: "Tools",
        apps: [
            {
                name: "PowerToys",
                package: "powertoys",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fmspoweruser.com%2Fwp-content%2Fuploads%2F2022%2F09%2FPowerToys-icon.png&f=1&nofb=1&ipt=a8a326f9db77da5f9a78826f11e3dc8cf14fecd1707b99178bec837a4f77255d&ipo=images",
            },
            {
                name: "Everything",
                package: "everything",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.lo4d.com%2Ft%2Ficon%2F128%2Feverything.png&f=1&nofb=1&ipt=ef4943188444ae270058e5a55306d4bd57372f12ac3e7ba1c12f7b09f74a02c8&ipo=images",
            },
            {
                name: "TeraCopy",
                package: "teracopy",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fis2-ssl.mzstatic.com%2Fimage%2Fthumb%2FPurple123%2Fv4%2Fed%2Fd9%2Fee%2Fedd9eea6-f6f0-7e22-2e04-d745b3b3ed09%2FAppIcon-0-85-220-0-0-0-0-4-0-0-0-2x-sRGB-0-0-0.png%2F1200x630bb.png&f=1&nofb=1&ipt=3ca124dff18804633bc2f1a9965c052e48d499c498dab505d5ee322be83c6cd7&ipo=images",
            },
            {
                name: "TreeSize Free",
                package: "treesizefree",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.jam-software.com%2Fsites%2Fdefault%2Ffiles%2Fimg%2Ficons%2FTreeSize-Icon.png&f=1&nofb=1&ipt=6f83592fb7014bda0efe48d57f725effc7997f6b1746cce83182b579abc0c0a6&ipo=images",
            },
            {
                name: "CPU-Z",
                package: "cpu-z.install",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fplay.seletronic.com.br%2Fwp-content%2Fuploads%2Fsites%2F19%2F2020%2F07%2FCPU-Z_icon.png&f=1&nofb=1&ipt=e55a6026bf0baa6a5ca4e63d1d5c145d928250979275ddc69aea5393f3970d86&ipo=images",
            },
            {
                name: "GPU-Z",
                package: "gpu-z.portable",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages-wixmp-ed30a86b8c4ca887773594c2.wixmp.com%2Ff%2F27f7c5a0-e1a4-4881-bddd-5aca9b1bc204%2Fde0lyld-cdbd9428-1041-4e96-b577-989301b25b86.png%2Fv1%2Ffill%2Fw_512%2Ch_512%2Cstrp%2Fgpu_z_icon_by_pitmankeks_de0lyld-fullview.png%3Ftoken%3DeyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9NTEyIiwicGF0aCI6IlwvZlwvMjdmN2M1YTAtZTFhNC00ODgxLWJkZGQtNWFjYTliMWJjMjA0XC9kZTBseWxkLWNkYmQ5NDI4LTEwNDEtNGU5Ni1iNTc3LTk4OTMwMWIyNWI4Ni5wbmciLCJ3aWR0aCI6Ijw9NTEyIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0._tX9OSIEROhxKb-m7fEf9HIgXAWckvWkF1F_rKaRkZk&f=1&nofb=1&ipt=6482894401d5c431af0c629043ca65eada75425374aa30ffca7956e5e3faa86a&ipo=images",
            },
            {
                name: "Etcher",
                package: "etcher",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fraw.githubusercontent.com%2Fbalena-io%2Fetcher%2Fmaster%2Fassets%2Ficon.png&f=1&nofb=1&ipt=fdfd61a43d0bda0fa1a29991e10ddadeee8429f79afa24536e00a223be83308d&ipo=images",
            },
            {
                name: "Rufus",
                package: "rufus",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2F1.bp.blogspot.com%2F-ViWSDDQc5VA%2FXwwg5a_H0LI%2FAAAAAAAADTo%2F_8FeiDACh4gHYcIuT8OqGBk4dgsXv-dKwCNcBGAsYHQ%2Fs1600%2Fusb-icon-1200x1200.png&f=1&nofb=1&ipt=2ffa3de9477fd9403a815621c66ccd578c6064cfd728dc26c49efc0c78359e31&ipo=images",
            },
            { name: "AutoHotkey", package: "autohotkey", icon: "vscode-icons:file-type-autohotkey" },
            {
                name: "Sysinternals Suite",
                package: "sysinternals",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F44955850%3Fs%3D280%26v%3D4&f=1&nofb=1&ipt=754ded41a27cc58b0b0119b996eab84d3ccd154f8d9d488ce20f81b3dcbeeef8&ipo=images",
            },
            {
                name: "Lightshot",
                package: "lightshot.install",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fis3-ssl.mzstatic.com%2Fimage%2Fthumb%2FPurple122%2Fv4%2Fee%2F12%2F5c%2Fee125cc2-a2a1-ae5d-b8b4-6156617ffb02%2Flightshot.png%2F1200x630bb.png&f=1&nofb=1&ipt=8d26c49777e0f407377446a5195a2887840e2ed873e28b7cdbd2fb7f0bcc56c1&ipo=images",
            },
            {
                name: "Flameshot",
                package: "flameshot",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F1381%2FPNG%2F512%2Fflameshot_93622.png&f=1&nofb=1&ipt=0ca42219bce013640dd03c1cae26baa79bbe957b83eb1972140e0701c97fa971&ipo=images",
            },
        ],
    },
    {
        category: "File Sharing",
        apps: [
            {
                name: "qBittorrent",
                package: "qbittorrent",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Fqbittorrent-icon-2048x2048-kbb7ayst.png&f=1&nofb=1&ipt=0a41c6c32045629a72de9979229ad658553f0c370312134be8315dc9bdb8fa5d&ipo=images",
            },
            {
                name: "Transmission",
                package: "transmission",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ficons.veryicon.com%2Fpng%2FApplication%2FMavrick%2FTransmission.png&f=1&nofb=1&ipt=5ae38f0bde1b50c5d2bc81a2c1113a9eba59f80865ba148dbdd7c10f097bd9be&ipo=images",
            },
            {
                name: "Deluge",
                package: "deluge",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Fdeluge-icon-256x256-oroyi3y6.png&f=1&nofb=1&ipt=6074a490369df7c55e054674299e66e72b5adab5fff2337b8eb7988dcab0fb41&ipo=images",
            },
        ],
    },
    {
        category: "Creative",
        apps: [
            {
                name: "OBS Studio",
                package: "obs-studio",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.logolynx.com%2Fimages%2Flogolynx%2F5c%2F5cc1b4995bc7aa4b5356ca3cf6968638.png&f=1&nofb=1&ipt=d4f9e914065740fd5339fca661e0bcaa72c87736d4184953c5f77db7466cd8cb&ipo=images",
            },
            {
                name: "Audacity",
                package: "audacity",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Faudacity-icon-462x512-n5heqj8v.png&f=1&nofb=1&ipt=3a5cb883a833e93e9f8ec68dc8df6b6c591f6e5d25004009603c7a0388e485bc&ipo=images",
            },
            {
                name: "Unity Hub",
                package: "unity-hub",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fgitlab.com%2Fuploads%2F-%2Fsystem%2Fproject%2Favatar%2F19511231%2Ftu3gt6ysfxq71.png&f=1&nofb=1&ipt=d10183c957c116c9f4738315afbce36f685676a52d054966ac9a19c5925a86a9&ipo=images",
            },
            { name: "Godot", package: "godot", icon: "devicon:godot" },
            { name: "Godot (mono)", package: "godot-mono", icon: "devicon:godot" },
            { name: "Blender", package: "blender", icon: "logos:blender" },
            {
                name: "Paint.NET",
                package: "paint.net",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Faux.iconspalace.com%2Fuploads%2F282314234258797826.png&f=1&nofb=1&ipt=55fa0dbe924c56a061e92cf90eb85e13d7d5c6d7bb30d75884da261e48fdb421&ipo=images",
            },
            { name: "GIMP", package: "gimp", icon: "devicon:gimp" },
            {
                name: "Krita",
                package: "krita",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages-wixmp-ed30a86b8c4ca887773594c2.wixmp.com%2Fi%2F12e17815-80d0-46f1-94d3-b80967f5ed69%2Fddegbk6-92e3dc56-474f-477c-a36d-9f457c70ae2d.png&f=1&nofb=1&ipt=94d198818b2bcbaa5cb9cc0394ec5ac1d9459439eca0fec008684f23d27c07df&ipo=images",
            },
            { name: "Figma", package: "figma", icon: "devicon:figma" },
            { name: "Inkscape", package: "inkscape", icon: "devicon:inkscape" },
        ],
    },
    {
        category: "Archives",
        apps: [
            {
                name: "7-Zip",
                package: "7zip",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ficon-library.com%2Fimages%2F7zip-icon%2F7zip-icon-3.jpg&f=1&nofb=1&ipt=09365c684c202619220b15d0eeb71b0573d27ffb65d3095adfb1e638ad546622&ipo=images",
            },
            {
                name: "PeaZip",
                package: "peazip.install",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fimages-wixmp-ed30a86b8c4ca887773594c2.wixmp.com%2Fi%2F94df4f8b-e4ce-4832-82bd-181b68cc65dc%2Fdda7cfe-86c36439-14bc-44c8-a015-7cd40b769ada.png&f=1&nofb=1&ipt=06034e700ab99258a053e27ff4457d83b42c9f6d647dab4f760469b118f7d51e&ipo=images",
            },
            {
                name: "WinRAR",
                package: "winrar",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.shareicon.net%2Fdata%2F512x512%2F2016%2F07%2F02%2F634676_winrar_512x512.png&f=1&nofb=1&ipt=cd14f4d0ef39a7ba669b7b6508838aee142b056b936dbe6230bdac0c27bb75bb&ipo=images",
            },
        ],
    },
    {
        category: "Cloud",
        apps: [
            {
                name: "Dropbox",
                package: "dropbox",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F1195%2FPNG%2F512%2F1490889640-dropbox_82530.png&f=1&nofb=1&ipt=b2f2bbf2c549b808cf736064c8cd738a22319a37ed9bba2eb08f86c0b2d18e56&ipo=images",
            },
            { name: "Google Drive", package: "googledrive", icon: "logos:google-drive" },
            {
                name: "Insync",
                package: "insync",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Finsync-icon-2048x2048-oca1fx4u.png&f=1&nofb=1&ipt=33b4f2fc2224256ee3a433eebd48a2db4f501d22c92ff9995e964522f4ae1b67&ipo=images",
            },
            {
                name: "Nextcloud",
                package: "nextcloud-client",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fforums.unraid.net%2Fuploads%2Fmonthly_2020_11%2Fnextcloud.thumb.png.2ac516b90c3a76dc41f268e7da38728f.png&f=1&nofb=1&ipt=378a86bdeebcee9292ab300cd3d7f2dbccde270f5d60e839a6145b5461902413&ipo=images",
            },
            {
                name: "Syncthing",
                package: "syncthing",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic-00.iconduck.com%2Fassets.00%2Fsyncthing-icon-2048x2048-mvwfe1p7.png&f=1&nofb=1&ipt=954d608bb654a06e80cc943b7f22157fec9e582113c3266e75c26a7bfb117e34&ipo=images",
            },
        ],
    },
    {
        category: "Documents",
        apps: [
            {
                name: "Foxit PDF Reader",
                package: "foxitreader",
                icon: "https://external-content.duckduckgo.com/iu/?u=http%3A%2F%2Fwww.icons101.com%2Ficon_png%2Fsize_512%2Fid_82078%2FFoxit.png&f=1&nofb=1&ipt=ba2987de2118b0aa42f686361af98fabf483ad5c0115e8c8f67f13fd08f2e133&ipo=images",
            },
            {
                name: "Sumatra PDF Reader",
                package: "sumatrapdf",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ffreesoft.ru%2Fstorage%2Fimages%2F204%2F2032%2F203117%2F203117_normal.png&f=1&nofb=1&ipt=6df0de1b7708e054b89b0e7145909f5a2134d0722ad42b92756cb1e9b0cf7a02&ipo=images",
            },
            {
                name: "Adobe Acrobat Reader",
                package: "adobereader",
                icon: "https://external-content.duckduckgo.com/iu/?u=http%3A%2F%2Fwww.iconeasy.com%2Ficon%2Fpng%2FApplication%2FAdobe%2520Round%2FAdobe%2520Reader.png&f=1&nofb=1&ipt=ec4385728ef13b5fe408ebc946934eaa211f0777462fd747dc69a38e7e68bfa0&ipo=images",
            },
            {
                name: "PDFCreator",
                package: "pdfcreator",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.101convert.com%2Fimg%2Fapp-icon%2F64%2F10356.png&f=1&nofb=1&ipt=ac3665906882ebfb4768b0923ffac7cbed60d3acf5cd2b1ddfe819114da1bf28&ipo=images",
            },
            {
                name: "CutePDF",
                package: "cutepdf",
                icon: "https://external-content.duckduckgo.com/iu/?u=http%3A%2F%2Fwww.cutepdf.com%2Fimages%2Fcutepdfwriter.png&f=1&nofb=1&ipt=1fd66ccdcf1f47fa50b7119cafe1fa2bdf29b1f68943b85316df1f575ecd7b26&ipo=images",
            },
        ],
    },
    {
        category: "Editing",
        apps: [
            {
                name: "Notion",
                package: "notion",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F2429%2FPNG%2F512%2Fnotion_logo_icon_147257.png&f=1&nofb=1&ipt=882a8458ba9b335aed265661fcc140fc48e2ac310735b40dfea3e91c937660b9&ipo=images",
            },
            { name: "Obsidian", package: "obsidian", icon: "skill-icons:obsidian-light" },
            {
                name: "Logseq",
                package: "logseq",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fpreview.redd.it%2Fi-made-a-3d-style-logseq-app-icon-v0-cnotdu81yeha1.png%3Fwidth%3D1386%26format%3Dpng%26auto%3Dwebp%26s%3D3a993245236c3aa9348260e21cf3f4eab34149d2&f=1&nofb=1&ipt=0838bf3f81a559bd4583f7cde7c228096d1e3583b2463baa5c96a45d1bd94d65&ipo=images",
            },
            {
                name: "LibreOffice",
                package: "libreoffice-fresh",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fvectorified.com%2Fimages%2Flibreoffice-icon-11.png&f=1&nofb=1&ipt=79392c3794b036fd5392ca1ec33c99c9a7962101be0869a9b0be1e82344f1037&ipo=images",
            },
        ],
    },
    {
        category: "Gaming",
        apps: [
            {
                name: "Steam",
                package: "steam",
                icon: "https://external-content.duckduckgo.com/iu/?u=http%3A%2F%2Flogos-download.com%2Fwp-content%2Fuploads%2F2016%2F05%2FSteam_icon_logo_logotype.png&f=1&nofb=1&ipt=03d4437d68460581387e3d7b5aafbb24a802e61affb6a8fba62bdc4e0f23ff4b&ipo=images",
            },
            {
                name: "Epic Games Launcher",
                package: "epicgameslauncher",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F3053%2FPNG%2F512%2Fepic_games_alt_macos_bigsur_icon_190199.png&f=1&nofb=1&ipt=e2b2f645791005594d966d3c2e61bb2d3de9cf5a55bc6c884cdf9436daf97ef5&ipo=images",
            },
            {
                name: "GOG Galaxy",
                package: "goggalaxy",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fvectorified.com%2Fimages%2Fgog-icon-12.png&f=1&nofb=1&ipt=071012d5f9fba09c8a5b5458c3835ef7047ceb520870326ab51cfe040201e6d0&ipo=images",
            },
            {
                name: "Legendary Games Launcher",
                package: "legendary",
                icon: "https://raw.githubusercontent.com/derrod/legendary/refs/heads/master/assets/windows_icon.ico",
            },
        ],
    },
    {
        category: "Programming Languges & Runtimes",
        apps: [
            { name: "Python 3", package: "python", icon: "devicon:python" },
            { name: "Python 2", package: "python2", icon: "devicon:python" },
            { name: "NodeJS", package: "nodejs.install", icon: "devicon:nodejs" },
            { name: "NodeJS (LTS)", package: "nodejs-lts", icon: "devicon:nodejs" },
            {
                name: "nvm (Node Version Manager)",
                package: "nvm",
                icon: "https://github.com/nvm-sh/logos/blob/414e1a32b2f0f07101717f1c301aa14f00f91f59/nvm-logo-color-avatar-white.png?raw=true",
            },
            { name: "Deno", package: "deno", icon: "logos:deno" },
            { name: "Oracle JDK 21", package: "oraclejdk", icon: "devicon:java" },
            { name: "Open JDK 17", package: "openjdk17", icon: "devicon:java" },
            { name: "Go", package: "golang", icon: "skill-icons:golang" },
            { name: "Rust", package: "rust", icon: "simple-icons:rust" },
            { name: "Rust MSVC", package: "rust-ms", icon: "simple-icons:rust" },
            { name: "Rustup", package: "rustup.install", icon: "simple-icons:rust" },
            { name: "Ruby", package: "ruby", icon: "devicon:ruby" },
            { name: "PHP", package: "php", icon: "devicon:php" },
            { name: "Perl", package: "strawberryperl", icon: "devicon:perl" },
        ],
    },
    {
        category: "Developer Tools",
        apps: [
            { name: "PowerShell", package: "powershell", icon: "skill-icons:powershell-dark" },
            { name: "Visual Studio Code", package: "vscode", icon: "devicon:vscode" },
            { name: "VSCodium", package: "vscodium", icon: "devicon:vscodium" },
            {
                name: "Notepad++",
                package: "notepadplusplus.install",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Ficons.veryicon.com%2Fpng%2FSystem%2FSimply%2520Styled%2FNotepad%2520Plus%2520Plus.png&f=1&nofb=1&ipt=787395893443066d53160f1cfa66e9fb800e0509390fc1b4fdacd50f73d0459b&ipo=images",
            },
            { name: "Git", package: "git", icon: "devicon:git" },
            { name: "Git LFS", package: "git-lfs", icon: "devicon:git" },
            { name: "AWS CLI", package: "awscli", icon: "skill-icons:aws-light" },
            { name: "Azure CLI", package: "azure-cli", icon: "devicon:azure" },
            { name: "Docker CLI", package: "docker-cli", icon: "devicon:docker" },
            { name: "Docker Desktop", package: "docker-desktop", icon: "devicon:docker" },
            { name: "Docker Compose", package: "docker-compose", icon: "devicon:docker" },
            {
                name: "OpenSSH",
                package: "openssh",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn-icons-png.flaticon.com%2F512%2F5376%2F5376334.png&f=1&nofb=1&ipt=431536c2355a641b35ddf957ce692a661d1ed2f07a40e07d7071e1fbd3f5ae36&ipo=images",
            },
            {
                name: "WinSCP",
                package: "winscp",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fvectorified.com%2Fimages%2Fwinscp-icon-18.png&f=1&nofb=1&ipt=0c03e1ba3250d18b92e9c64a4a71cec1f09ca7d85641e689b922685b8f805a11&ipo=images",
            },
            { name: "FileZilla", package: "filezilla", icon: "devicon:filezilla" },
            { name: "PuTTY", package: "putty", icon: "devicon:putty" },
            { name: "Arduino IDE", package: "arduino", icon: "devicon:arduino" },
            { name: "cURL", package: "curl", icon: "file-icons:curl" },
            { name: "GNU Wget", package: "wget", icon: "file-icons:wget" },
            {
                name: "VirtualBox",
                package: "virtualbox",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn.icon-icons.com%2Ficons2%2F2699%2FPNG%2F512%2Fvirtualbox_logo_icon_169253.png&f=1&nofb=1&ipt=c91ca1b0a5dc6f586c4900c55b403cd142b45ef0526a64082c4558429fa5c422&ipo=images",
            },
            {
                name: "Wireshark",
                package: "wireshark",
                icon: "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.pngkit.com%2Fpng%2Ffull%2F365-3657626_wireshark-icon.png&f=1&nofb=1&ipt=31736f6b7b6b584ff79b074fee7e345e299632c5eb25bd3ccc6ec99197568648&ipo=images",
            },
        ],
    },
];
