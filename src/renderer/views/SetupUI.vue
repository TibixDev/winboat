<template>
    <div class="relative size-full p-16 overflow-hidden">
        <div class="size-full rounded-3xl bg-[#1F1F1F] shadow-lg shadow-black/50 gap-4 p-5 grid grid-cols-2">
            <div>
                <div id="stepStatus" class="flex flex-row justify-center gap-4 pt-2">
                    <div
                        v-for="(step, idx) of steps"
                        :key="idx"
                        class="w-4 h-4 rounded-full bg-neutral-700 transition duration-1000"
                        :class="{
                            'bg-neutral-500': idx < currentStepIdx,
                            'bg-violet-400': idx === currentStepIdx,
                            'bg-neutral-700': idx > currentStepIdx,
                        }"
                    ></div>
                </div>
                <Transition name="bounce" mode="out-in">
                    <div :key="currentStepIdx" id="stepIcon" class="flex items-center justify-center relative h-full">
                        <Icon key="icon1" class="size-[60%] text-violet-400 z-30 relative" :icon="currentStep.icon"></Icon>
                        <Icon key="icon-gradient" class="size-[60%] text-violet-400 brightness-75 z-20 absolute top-[50%] translate-y-[-50%] blur-2xl" :icon="currentStep.icon"></Icon>
                        <Icon key="icon2" class="size-[60%] text-violet-400 brightness-75 z-20 absolute top-[51.5%] translate-y-[-50%] translate-x-[1.5%]" :icon="currentStep.icon"></Icon>
                        <Icon key="icon3" class="size-[60%] text-violet-400 brightness-50 z-10 absolute top-[53%] translate-y-[-50%] translate-x-[3%]" :icon="currentStep.icon"></Icon>                    
                    </div>
                </Transition>
            </div>

            <Transition name="bouncedown" mode="out-in">
                <div :key="currentStepIdx" id="stepContent" class="overflow-scroll">
                    <!-- Welcome -->
                    <div v-if="currentStep.id === StepID.WELCOME" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            WinBoat is a full fledged app that helps you natively run Windows applications on your Linux machine with ease.
                        </p>
                        <p class="text-lg text-gray-400">
                            We will go through a few required steps to get you started in no time.
                        </p>
                        <div class="flex flex-row gap-4">
                            <x-button toggled class="px-6" @click="currentStepIdx++">Next</x-button>
                        </div>
                    </div>
    
                    <!-- License -->
                    <div v-if="currentStep.id === StepID.LICENSE" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            WinBoat is open-source software licensed under the MIT License. Please review the license agreement below.
                        </p>
                        <pre class="text-sm text-gray-400 bg-neutral-800 p-4 rounded-lg overflow-auto">{{ license }}</pre>
                        <div class="flex flex-row gap-4">
                            <x-button class="px-6" @click="currentStepIdx--">Back</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">I Agree</x-button>
                        </div>
                    </div>

                    <!-- Pre-Requisites -->
                    <div v-if="currentStep.id === StepID.PREREQUISITES" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            In order to run WinBoat, your computer must meet the following requirements.
                        </p>
                        <ul class="text-lg text-gray-400 list-none space-y-2 bg-neutral-800 py-4 rounded-lg">
                            <li class="flex items-center gap-2">
                                <span v-if="specs.ramGB >= 4" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                At least 4 GB of RAM (Detected: {{ specs.ramGB }} GB)
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.cpuThreads >= 2" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                At least 2 CPU threads (Detected: {{ specs.cpuThreads }} threads)
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.diskSpaceGB >= 32" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                At least 32 GB free space in <span class="font-mono bg-neutral-700 rounded-md px-0.5">/var</span>
                                (Detected: {{ specs.diskSpaceGB }} GB)
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.kvmEnabled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                Virtualization (KVM) enabled
                                <a href="https://duckduckgo.com/?t=h_&q=how+to+enable+virtualization+in+%3Cmotherboard+brand%3E+bios&ia=web" @click="openAnchorLink" target="_blank" class="text-violet-400 hover:underline ml-1">How?</a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerInstalled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                Docker installed
                                <a href="https://docs.docker.com/engine/install/" @click="openAnchorLink" target="_blank" class="text-violet-400 hover:underline ml-1">How?</a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerComposeInstalled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                Docker Compose v2 installed
                                <a href="https://docs.docker.com/compose/install/#plugin-linux-only" @click="openAnchorLink" target="_blank" class="text-violet-400 hover:underline ml-1">How?</a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerIsInUserGroups" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                User added to the <span class="font-mono bg-neutral-700 rounded-md px-0.5">docker</span> group
                                <a href="https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user" @click="openAnchorLink" target="_blank" class="text-violet-400 hover:underline ml-1">How?</a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.freeRDPInstalled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                FreeRDP installed
                                <a href="https://github.com/FreeRDP/FreeRDP/wiki/PreBuilds" @click="openAnchorLink" target="_blank" class="text-violet-400 hover:underline ml-1">How?</a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.ipTablesLoaded && specs.iptableNatLoaded" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                <span class="font-mono bg-neutral-700 rounded-md px-0.5">iptables</span> and 
                                <span class="font-mono bg-neutral-700 rounded-md px-0.5">iptable_nat</span> modules loaded
                                <a href="https://rentry.org/rmfq2e5e" @click="openAnchorLink" target="_blank" class="text-violet-400 hover:underline ml-1">How?</a>
                            </li>                            
                        </ul>
                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">Back</x-button>
                            <x-button 
                                toggled 
                                class="px-6" 
                                @click="currentStepIdx++" 
                                :disabled="!satisfiesPrequisites(specs)"
                            >
                                Next
                            </x-button>
                        </div>
                    </div>
    
                    <!-- Windows Configuration -->
                    <div v-if="currentStep.id === StepID.WINDOWS_CONFIG" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            Pick the version of Windows you want to install, and the language you'd like to use.
                        </p>
                        <p class="text-lg text-gray-400">
                            You can only change these settings now. Once the installation is complete, you will not be able to change them unless you reinstall.
                        </p>
                        <div>
                            <label for="select-edition" class="text-sm mb-4 text-neutral-400">Select Edition</label>
                            <x-select
                                id="select-edition"
                                @change="(e: any) => windowsVersion = e.detail.newValue"
                                class="w-64"
                                :disabled="!!customIsoPath"
                            >
                                <x-menu>
                                    <x-menuitem
                                        v-for="(version, key) in WINDOWS_VERSIONS"
                                        :key="key"
                                        :value="key"
                                        :toggled="windowsVersion === key"
                                        v-show="key !== 'custom'"
                                    >
                                        <x-label>{{ version }}</x-label>
                                    </x-menuitem>
                                </x-menu>
                            </x-select>
                        </div>
                        <div>
                            <label for="select-language" class="text-sm mb-4 text-neutral-400">Select Language</label>
                            <x-select
                                id="select-language"
                                @change="(e: any) => windowsLanguage = e.detail.newValue"
                                class="w-64"
                                :disabled="!!customIsoPath"
                            >
                                <x-menu @change="(e: any) => windowsLanguage = e.detail.newValue">
                                    <x-menuitem
                                        v-for="(language, languageWithBanner) in WINDOWS_LANGUAGES"
                                        :key="language"
                                        :value="language"
                                        :toggled="windowsLanguage === language"
                                        :disabled="['German', 'Hungarian'].includes(language)"
                                    >
                                        <x-label>
                                            {{ languageWithBanner }}
                                            <span v-if="['German', 'Hungarian'].includes(language)" class="text-red-400">
                                                (Broken, use Language Pack)
                                            </span>
                                        </x-label>
                                    </x-menuitem>
                                </x-menu>
                            </x-select>
                        </div>
                        <div class="mt-4">
                            <div class="flex flex-col gap-2">
                                <label for="select-iso" class="text-xs text-neutral-400">Custom ISO (Optional)</label>
                                <div class="flex items-center gap-2">
                                    <x-button id="select-iso" class="w-64 text-sm" @click="selectIsoFile">Select ISO File</x-button>
                                    <span class="relative group">
                                        <Icon icon="line-md:question-circle" class="text-neutral-400 cursor-pointer" />
                                        <span class="absolute left-6 top-1 z-50 w-[320px] bg-neutral-900 text-xs text-gray-300 rounded shadow-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                                            We offer you the possibility of using a custom Windows ISO for your convenience, however we can't provide any support if your custom ISO breaks or certain features within WinBoat stop working.
                                        </span>
                                    </span>
                                </div>
                                <span v-if="customIsoPath" class="text-xs text-gray-400 font-semibold flex items-center gap-2">
                                    Selected: {{ customIsoFileName }}
                                    <x-button size="small" class="ml-2 px-2 py-0" @click="deselectIsoFile">Remove</x-button>
                                </span>
                            </div>
                        </div>
                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">Back</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">Next</x-button>
                        </div>
                    </div>

                    <!-- User Configuration -->
                    <div v-if="currentStep.id === StepID.USER_CONFIG" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            Configure the username and password for the Windows user account.
                        </p>
    
                        <p class="text-lg text-gray-400">
                            These credentials will be used to log in to the Windows virtual machine and to access it through Remote Desktop Protocol (RDP).
                            You will not be able to change these settings later on unless you reinstall.
                        </p>
    
    
                        <div>
                            <label for="select-username" class="text-sm mb-4 text-neutral-400">Username</label>
                            <x-input
                                id="select-username"
                                class="w-64 max-w-64"
                                type="text"
                                minlength="2"
                                maxlength="32"
                                required 
                                size="large"
                                :value="username"
                                @input="(e: any) => username = e.target.value"
                            >
                                <x-icon href="#person"></x-icon>
                                <x-label>Name</x-label>
                            </x-input>
                        </div>
    
                        <div>
                            <label for="select-password" class="text-sm mb-4 text-neutral-400">Password</label>
                            <x-input 
                                id="select-password" 
                                class="w-64 max-w-64" 
                                type="password" 
                                minlength="2" 
                                maxlength="64"
                                required 
                                size="large"
                                :value="password"
                                @input="(e: any) => password = e.target.value"
                            >
                                <x-icon href="#lock"></x-icon>
                                <x-label>Password</x-label>
                            </x-input>
                        </div>
    
                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">Back</x-button>
                            <x-button
                                :disabled="username.length < 2 || password.length < 2"
                                toggled
                                class="px-6"
                                @click="currentStepIdx++"
                            >Next</x-button>
                        </div>
                    </div>
    
                    <!-- Hardware Configuration -->
                    <div v-if="currentStep.id === StepID.HARDWARE_CONFIG" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            WinBoat utilizes a containerized KVM virtual machine to run Windows applications. Please configure the hardware settings for the virtual machine.
                        </p>
    
                        <p class="text-lg text-gray-400">
                            It is not recommended to allocate more than half of your system resources to Windows. You will be able to change these settings later on if needed.
                        </p>
    
    
                        <div class="flex flex-col gap-6">
                            <div>
                                <label for="select-cpu-cores" class="text-sm text-neutral-400">Select CPU Cores</label>
                                <div class="flex flex-row gap-4 items-center">
                                    <x-slider
                                        id="select-cpu-cores"
                                        @change="(e: any) => cpuThreads = Number(e.target.value)"
                                        class="w-[50%]"
                                        :value="cpuThreads"
                                        :min="MIN_CPU_THREADS"
                                        :max="specs.cpuThreads"
                                        step="1"
                                        ticks
                                    ></x-slider>
                                    <x-label>{{ cpuThreads }} Cores</x-label>
                                </div>
                            </div>
        
                            <div>
                                <label for="select-ram" class="text-sm text-neutral-400">Select RAM</label>
                                <div class="flex flex-row gap-4 items-center">
                                    <x-slider
                                        id="select-ram"
                                        @change="(e: any) => ramGB = Number(e.target.value)"
                                        class="w-[50%]"
                                        :value="ramGB"
                                        :min="MIN_RAM_GB"
                                        :max="specs.ramGB"
                                        step="1"
                                    ></x-slider>
                                    <x-label>{{ ramGB }} GB</x-label>
                                </div>
                            </div>
        
                            <div>
                                <label for="select-disk" class="text-sm text-neutral-400">Select Disk Size</label>
                                <div class="flex flex-row gap-4 items-center">
                                    <x-slider
                                        id="select-disk"
                                        @change="(e: any) => diskSpaceGB = Number(e.target.value)"
                                        class="w-[50%]"
                                        :value="diskSpaceGB"
                                        :min="MIN_DISK_GB"
                                        :max="specs.diskSpaceGB"
                                        step="8"
                                    ></x-slider>
                                    <x-label>{{ diskSpaceGB }} GB</x-label>
                                </div>
                            </div>
                        </div>

    
                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">Back</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">Next</x-button>
                        </div>
                    </div>
    
                    <!-- Review -->
                    <div v-if="currentStep.id === StepID.REVIEW" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ currentStep.title }}</h1>
                        <p class="text-lg text-gray-400">
                            Please review the settings you've chosen for your WinBoat installation. If everything looks correct, click "Install" to begin.
                        </p>
    
                        <div class="bg-neutral-800 p-6 rounded-lg flex flex-col gap-4">
                            <h2 class="text-xl font-medium text-white mt-0 mb-2">Your Configuration</h2>
                            
                            <div class="grid grid-cols-2 gap-4">
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">Windows Version</span>
                                    <span class="text-base text-white">{{ WINDOWS_VERSIONS[windowsVersion] }}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">Language</span>
                                    <span class="text-base text-white">{{ windowsLanguage }}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">CPU Cores</span>
                                    <span class="text-base text-white">{{ cpuThreads }} Cores</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">RAM</span>
                                    <span class="text-base text-white">{{ ramGB }} GB</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">Disk Size</span>
                                    <span class="text-base text-white">{{ diskSpaceGB }} GB</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">Username</span>
                                    <span class="text-base text-white">{{ username }}</span>
                                </div>
                            </div>
                        </div>
    
                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">Back</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++; install()">Install</x-button>
                        </div>
                    </div>
    
                    <!-- Installation -->
                    <div v-if="currentStep.id === StepID.INSTALL" class="step-block">
                        <h1 class="text-3xl font-semibold">Installation</h1>
                        <p class="text-lg text-gray-400 text-justify">
                            WinBoat is now installing Windows. Please be patient as this may take up to an hour.
                            In the meantime you can grab coffee and check the status <a href="http://127.0.0.1:8006" @click="openAnchorLink">in your browser</a>.
                        </p>
    
                        <!-- Installing -->
                        <div v-if="installState !== InstallStates.COMPLETED && installState !== InstallStates.INSTALL_ERROR" class="flex flex-col h-full items-center justify-center gap-4">
                            <x-throbber class="size-16"></x-throbber>
                            <x-label v-if="installState !== InstallStates.MONITORING_PREINSTALL" class="text-lg text-gray-400 text-center">
                                {{ installState }}...
                            </x-label>
                            <x-label v-else class="text-lg text-gray-400 text-center">
                                {{ preinstallMsg }}
                            </x-label>
                        </div>

                        <!-- Error -->
                         <div v-if="installState === InstallStates.INSTALL_ERROR" class="flex flex-col h-full items-center justify-center gap-4">
                            <Icon icon="line-md:alert" class="size-16 text-red-500"></Icon>
                            <x-label class="text-lg text-gray-400 text-center">
                                An error occurred while installing Windows. Please check the logs in <span class="font-mono bg-neutral-700 rounded-md px-0.5">~/.winboat</span> for more information.
                            </x-label>
                        </div>

                        <!-- Completed -->
                         <div v-if="installState === InstallStates.COMPLETED" class="flex flex-col h-full items-center justify-center gap-4">
                            <Icon icon="line-md:confirm-circle" class="size-16 text-green-500"></Icon>
                            <x-label class="text-lg text-gray-400 text-center">
                                Windows has been installed successfully!
                            </x-label>
                            <x-button @click="$router.push('/home')">Finish</x-button>
                         </div>
                    </div>
                </div>
            </Transition>
        </div>
        <div class="absolute gradient-bg left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] -z-10"></div>
    </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { InstallConfiguration, Specs } from '../../types';
import { getSpecs, defaultSpecs, satisfiesPrequisites } from '../lib/specs';
import { WINDOWS_VERSIONS, WINDOWS_LANGUAGES, type WindowsVersionKey } from "../lib/constants";
import { InstallManager, type InstallState, InstallStates } from '../lib/install';
import { openAnchorLink } from '../utils/openLink';
import license from '../assets/LICENSE.txt?raw'

const path: typeof import('path') = require('path')
const electron: typeof import('electron') = require('electron').remote || require('@electron/remote');
const os: typeof import('os') = require('os');

type Step = {
    id: string,
    title: string,
    icon: string,
}

enum StepID {
    WELCOME = "STEP_WELCOME",
    PREREQUISITES = "STEP_PREREQUISITES",
    LICENSE = "STEP_LICENSE",
    WINDOWS_CONFIG = "STEP_WINDOWS_CONFIG",
    HARDWARE_CONFIG = "STEP_HARDWARE_CONFIG",
    USER_CONFIG = "STEP_USER_CONFIG",
    REVIEW = "STEP_OVERVIEW",
    INSTALL = "STEP_INSTALL",
    FINISH = "STEP_FINISH",
}

const steps: Step[] = [
    {
        id: StepID.WELCOME,
        title: "Welcome to WinBoat",
        icon: "tdesign:wave-bye-filled",
    },
    {
        id: StepID.LICENSE,
        title: "License Agreement",
        icon: "line-md:text-box-multiple",
    },
    {
        id: StepID.PREREQUISITES,
        title: "Pre-Requisites",
        icon: "line-md:check-all",
    },
    {
        id: StepID.WINDOWS_CONFIG,
        title: "Configure Windows",
        icon: "mage:microsoft-windows",
    },
    {
        id: StepID.USER_CONFIG,
        title: "User Configuration",
        icon: "line-md:account",
    },
    {
        id: StepID.HARDWARE_CONFIG,
        title: "Hardware Configuration",
        icon: "famicons:hardware-chip-outline",
    },
    {
        id: StepID.REVIEW,
        title: "Review",
        icon: "solar:pin-list-bold",
    },
    {
        id: StepID.INSTALL,
        title: "Installation",
        icon: "line-md:downloading-loop",
    },
    {
        id: StepID.FINISH,
        title: "Finish",
        icon: "bx:bxs-check-circle",
    },
]

const MIN_CPU_THREADS = 1;
const MIN_RAM_GB = 2;
const MIN_DISK_GB = 32;
const $router = useRouter();
const specs = ref<Specs>({ ...defaultSpecs });
const currentStepIdx = ref(0);
const currentStep = computed(() => steps[currentStepIdx.value]);
const windowsVersion = ref<WindowsVersionKey>("11");
const windowsLanguage = ref("English");
const customIsoPath = ref("");
const customIsoFileName = ref("");
const cpuThreads = ref(2);
const ramGB = ref(4);
const diskSpaceGB = ref(32);
const username = ref("winboat");
const password = ref("");
const installState = ref<InstallState>(InstallStates.IDLE);
const preinstallMsg = ref("");

onMounted(async () => {
    specs.value = await getSpecs();
    console.log("Specs", specs.value);
    username.value = os.userInfo().username;
    console.log("Username", username.value);
})

function selectIsoFile() {
    electron.dialog.showOpenDialog({
        title: 'Select ISO File',
        filters: [
          {
            name: 'ISO Files',
            extensions: ['iso']
          }
        ],
        properties: ['openFile']
    })
    .then(result => {
      if (!result.canceled && result.filePaths.length > 0) {
        customIsoPath.value = result.filePaths[0];
        customIsoFileName.value = path.basename(result.filePaths[0]);
        windowsLanguage.value = 'English'; // Language can't be custom
        windowsVersion.value = 'custom';
        console.log('ISO path updated:', customIsoPath.value);
      }
    });
}

function deselectIsoFile() {
    customIsoPath.value = "";
    customIsoFileName.value = "";
    windowsLanguage.value = 'English';
    windowsVersion.value = '11';
}

function install() {
    const installConfig: InstallConfiguration = {
        windowsVersion: windowsVersion.value,
        windowsLanguage: windowsLanguage.value,
        cpuThreads: cpuThreads.value,
        ramGB: ramGB.value,
        diskSpaceGB: diskSpaceGB.value,
        username: username.value,
        password: password.value,
        ...(customIsoPath.value ? { customIsoPath: customIsoPath.value } : {}),
    }

    // Begin installation and attach event listeners
    const installManager = new InstallManager(installConfig);
    installManager.emitter.on("stateChanged", newState => {
        installState.value = newState;
        console.log("Install state changed", newState);
    });

    installManager.emitter.on("preinstallMsg", msg => {
        preinstallMsg.value = msg;
        console.log("Preinstall msg", msg);
    });

    installManager.install();
}
</script>

<style>
.gradient-bg {
    width: 90vw;
    height: 80vh;
    border-radius: 10px;
    background: linear-gradient(197.37deg, #7450DB -0.38%, rgba(138, 234, 240, 0) 101.89%), linear-gradient(115.93deg, #3E88F6 4.86%, rgba(62, 180, 246, 0.33) 38.05%, rgba(62, 235, 246, 0) 74.14%), radial-gradient(56.47% 76.87% at 6.92% 7.55%, rgba(62, 136, 246, 0.7) 0%, rgba(62, 158, 246, 0.182) 52.16%, rgba(62, 246, 246, 0) 100%), linear-gradient(306.53deg, #2EE4E3 19.83%, rgba(46, 228, 227, 0) 97.33%);
    background-blend-mode: normal, normal, normal, normal, normal, normal;
    filter: blur(50px);
}

.step-block {
    @apply flex flex-col gap-4 h-full justify-center;
}

.flex p {
    margin-top: 5px;
    margin-bottom: 5px;
}

/* Transitions */
.bounce-enter-active {
  animation: bounce-in 0.4s;
}
.bounce-leave-active {
  animation: bounce-in 0.4s reverse;
}

@keyframes bounce-in {
  0% {
    transform: scale(0.7) translateY(-20%);
    opacity: 0%;
  }
  100% {
    transform: scale(1) translateY(0);
  }
}

.bouncedown-enter-active {
  animation: bouncedown-in 0.5s;
}
.bouncedown-leave-active {
  animation: bouncedown-in 0.5s reverse;
}
@keyframes bouncedown-in {
  0% {
    transform: scale(0.7) translateY(-20%);
    opacity: 0%;
  }
  100% {
    transform: scale(1) translateY(0);
  }
}
</style>