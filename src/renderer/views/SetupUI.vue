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
                        <Icon
                            key="icon1"
                            class="size-[60%] text-violet-400 z-30 relative"
                            :icon="currentStep.icon"
                        ></Icon>
                        <Icon
                            key="icon-gradient"
                            class="size-[60%] text-violet-400 brightness-75 z-20 absolute top-[50%] translate-y-[-50%] blur-2xl"
                            :icon="currentStep.icon"
                        ></Icon>
                        <Icon
                            key="icon2"
                            class="size-[60%] text-violet-400 brightness-75 z-20 absolute top-[51.5%] translate-y-[-50%] translate-x-[1.5%]"
                            :icon="currentStep.icon"
                        ></Icon>
                        <Icon
                            key="icon3"
                            class="size-[60%] text-violet-400 brightness-50 z-10 absolute top-[53%] translate-y-[-50%] translate-x-[3%]"
                            :icon="currentStep.icon"
                        ></Icon>
                    </div>
                </Transition>
            </div>

            <Transition name="bouncedown" mode="out-in">
                <div :key="currentStepIdx" id="stepContent" class="overflow-scroll">
                    <!-- Welcome -->
                    <div v-if="currentStep.id === StepID.WELCOME" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("welcome.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("welcome.description1") }}
                        </p>
                        <p class="text-lg text-gray-400">
                            {{ t("welcome.description2") }}
                        </p>
                        <div class="flex flex-row gap-4">
                            <x-button toggled class="px-6" @click="currentStepIdx++">{{ t("welcome.nextButton") }}</x-button>
                        </div>
                    </div>

                    <!-- License -->
                    <div v-if="currentStep.id === StepID.LICENSE" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("license.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("license.description") }}
                        </p>
                        <pre class="text-sm text-gray-400 bg-neutral-800 p-4 rounded-lg overflow-auto">{{
                            license
                        }}</pre>
                        <div class="flex flex-row gap-4">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">{{ t("license.agreeButton") }}</x-button>
                        </div>
                    </div>

                    <!-- Pre-Requisites -->
                    <div v-if="currentStep.id === StepID.PREREQUISITES" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("prerequisites.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("prerequisites.description") }}
                        </p>
                        <ul class="text-lg text-gray-400 list-none space-y-1.5 bg-neutral-800 py-3 rounded-lg">
                            <li class="flex items-center gap-2">
                                <span v-if="specs.ramGB >= 4" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.ram", { ramGB: specs.ramGB }) }}
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.cpuCores >= 2" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.cpu", { cpuCores: specs.cpuCores }) }}
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.kvmEnabled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.kvm") }}
                                <a
                                    href="https://duckduckgo.com/?t=h_&q=how+to+enable+virtualization+in+%3Cmotherboard+brand%3E+bios&ia=web"
                                    @click="openAnchorLink"
                                    target="_blank"
                                    class="text-violet-400 hover:underline ml-1"
                                >
                                    {{ t("prerequisites.how") }}
                                </a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerInstalled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.docker") }}
                                <a
                                    href="https://docs.docker.com/engine/install/"
                                    @click="openAnchorLink"
                                    target="_blank"
                                    class="text-violet-400 hover:underline ml-1"
                                >
                                    {{ t("prerequisites.how") }}
                                </a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerComposeInstalled" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.dockerCompose") }}
                                <a
                                    href="https://docs.docker.com/compose/install/#plugin-linux-only"
                                    @click="openAnchorLink"
                                    target="_blank"
                                    class="text-violet-400 hover:underline ml-1"
                                >
                                    {{ t("prerequisites.how") }}
                                </a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerIsInUserGroups" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.dockerGroup") }}
                                <span class="font-mono bg-neutral-700 rounded-md px-0.5">docker</span>
                                <span class="text-gray-600"> {{ t("prerequisites.relogRequired") }} </span>
                                <a
                                    href="https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user"
                                    @click="openAnchorLink"
                                    target="_blank"
                                    class="text-violet-400 hover:underline ml-1"
                                >
                                    {{ t("prerequisites.how") }}
                                </a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.dockerIsRunning" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.dockerRunning") }}
                                <span class="text-gray-600"> {{ t("prerequisites.enableOnBoot") }} </span>
                                <a
                                    href="https://docs.docker.com/config/daemon/start/"
                                    @click="openAnchorLink"
                                    target="_blank"
                                    class="text-violet-400 hover:underline ml-1"
                                >
                                    {{ t("prerequisites.how") }}
                                </a>
                            </li>
                            <li class="flex items-center gap-2">
                                <span v-if="specs.freeRDP3Installed" class="text-green-500">✔</span>
                                <span v-else class="text-red-500">✘</span>
                                {{ t("prerequisites.freerdp") }}
                                <a
                                    href="https://github.com/FreeRDP/FreeRDP/wiki/PreBuilds"
                                    @click="openAnchorLink"
                                    target="_blank"
                                    class="text-violet-400 hover:underline ml-1"
                                >
                                    {{ t("prerequisites.how") }}
                                </a>
                            </li>
                        </ul>
                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button
                                toggled
                                class="px-6"
                                @click="currentStepIdx++"
                                :disabled="!satisfiesPrequisites(specs)"
                            >
                                {{ t("prerequisites.nextButton") }}
                            </x-button>
                        </div>
                    </div>

                    <!-- Install Location -->
                    <div v-if="currentStep.id === StepID.INSTALL_LOCATION" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("installLocation.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("installLocation.description1") }}
                        </p>
                        <p class="text-lg text-gray-400">
                            {{ t("installLocation.description2", { minDiskGB: MIN_DISK_GB }) }}
                        </p>

                        <div class="flex flex-row items-center mt-4">
                            <x-input
                                id="install-location"
                                type="text"
                                :placeholder="t('installLocation.inputPlaceholder')"
                                readonly
                                :value="installFolder"
                                class="!max-w-full w-[300px] rounded-r-none"
                            >
                                <x-icon href="#folder"></x-icon>
                                <x-label>/your/install/folder</x-label>
                            </x-input>
                            <x-button class="!rounded-l-none" toggled @click="selectInstallFolder">
                                {{ installFolder ? t("installLocation.changeButton") : t("installLocation.selectButton") }}
                            </x-button>
                        </div>

                        <div id="install-folder-errors" class="h-[4rem] text-red-400 text-sm font-semibold space-y-1">
                            <div v-for="error in installFolderErrors" :key="error">
                                <Icon icon="line-md:alert" class="inline size-4 -translate-y-0.5"></Icon>
                                {{ error }}
                            </div>
                            <div
                                v-if="installFolder && !installFolderErrors?.length"
                                class="text-green-400 font-semibold"
                            >
                                <Icon icon="line-md:check-all" class="inline size-4 -translate-y-0.5"></Icon>
                                {{ t("installLocation.validFolder") }}
                            </div>
                        </div>

                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button
                                toggled
                                class="px-6"
                                :disabled="!installFolder || installFolderErrors?.length"
                                @click="currentStepIdx++"
                                >{{ t("prerequisites.nextButton") }}</x-button
                            >
                        </div>
                    </div>

                    <!-- Windows Configuration -->
                    <div v-if="currentStep.id === StepID.WINDOWS_CONFIG" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("windowsConfig.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("windowsConfig.description1") }}
                        </p>
                        <p class="text-lg text-gray-400">
                            {{ t("windowsConfig.description2") }}
                        </p>
                        <div>
                            <label for="select-edition" class="text-sm mb-4 text-neutral-400">{{ t("windowsConfig.edition") }}</label>
                            <x-select
                                id="select-edition"
                                @change="(e: any) => (windowsVersion = e.detail.newValue)"
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
                            <label for="select-language" class="text-sm mb-4 text-neutral-400">{{ t("windowsConfig.language") }}</label>
                            <x-select
                                id="select-language"
                                @change="(e: any) => (windowsLanguage = e.detail.newValue)"
                                class="w-64"
                                :disabled="!!customIsoPath"
                            >
                                <x-menu @change="(e: any) => (windowsLanguage = e.detail.newValue)">
                                    <x-menuitem
                                        v-for="(language, languageWithBanner) in WINDOWS_LANGUAGES"
                                        :key="language"
                                        :value="language"
                                        :toggled="windowsLanguage === language"
                                        :disabled="['German', 'Hungarian'].includes(language)"
                                    >
                                        <x-label>
                                            {{ languageWithBanner }}
                                            <span
                                                v-if="['German', 'Hungarian'].includes(language)"
                                                class="text-red-400"
                                            >
                                                {{ t("windowsConfig.brokenLang") }}
                                            </span>
                                        </x-label>
                                    </x-menuitem>
                                </x-menu>
                            </x-select>
                        </div>
                        <div class="mt-4">
                            <div class="flex flex-col gap-2">
                                <label for="select-iso" class="text-xs text-neutral-400">{{ t("windowsConfig.customIso") }}</label>
                                <div class="flex items-center gap-2">
                                    <x-button id="select-iso" class="text-sm w-64" @click="selectIsoFile"
                                        >{{ t("windowsConfig.selectIsoButton") }}</x-button
                                    >
                                    <span class="relative group">
                                        <Icon icon="line-md:alert" class="text-neutral-400 cursor-pointer" />
                                        <span
                                            class="absolute bottom-5 left-[-160px] z-50 w-[320px] bg-neutral-900 text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none"
                                        >
                                            {{ t("windowsConfig.isoWarning") }}
                                        </span>
                                    </span>
                                </div>
                                <span
                                    v-if="customIsoPath"
                                    class="text-xs text-gray-400 font-semibold flex items-center gap-2"
                                >
                                    {{ t("windowsConfig.selectedIso", { fileName: customIsoFileName }) }}
                                    <x-button size="small" class="ml-2 px-2 py-0" @click="deselectIsoFile"
                                        >{{ t("windowsConfig.removeButton") }}</x-button
                                    >
                                </span>
                            </div>
                        </div>
                        <div class="flex flex-row gap-4 mt-6" :class="{ '!mt-2': customIsoPath }">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">{{ t("prerequisites.nextButton") }}</x-button>
                        </div>
                    </div>

                    <!-- User Configuration -->
                    <div v-if="currentStep.id === StepID.USER_CONFIG" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("userConfig.title") }}</h1>
                        <p class="text-lg text-gray-400">{{ t("userConfig.description1") }}</p>

                        <p class="text-lg text-gray-400">
                            {{ t("userConfig.description2") }}
                        </p>

                        <div class="flex flex-row gap-4">
                            <div class="flex flex-col gap-4">
                                <div>
                                    <label for="select-username" class="text-sm mb-4 text-neutral-400">{{ t("userConfig.username") }}</label>
                                    <x-input
                                        id="select-username"
                                        class="w-64 max-w-64"
                                        type="text"
                                        minlength="2"
                                        maxlength="32"
                                        required
                                        size="large"
                                        :value="username"
                                        @input="(e: any) => (username = e.target.value)"
                                    >
                                        <x-icon href="#person"></x-icon>
                                        <x-label>{{ t("userConfig.username") }}</x-label>
                                    </x-input>
                                </div>

                                <div>
                                    <label for="select-password" class="text-sm mb-4 text-neutral-400">{{ t("userConfig.password") }}</label>
                                    <x-input
                                        id="select-password"
                                        class="w-64 max-w-64"
                                        type="password"
                                        minlength="2"
                                        maxlength="64"
                                        required
                                        size="large"
                                        :value="password"
                                        @input="(e: any) => (password = e.target.value)"
                                    >
                                        <x-icon href="#lock"></x-icon>
                                        <x-label>{{ t("userConfig.password") }}</x-label>
                                    </x-input>
                                </div>

                                <div>
                                    <label for="confirm-password" class="text-sm mb-4 text-neutral-400"
                                        >{{ t("userConfig.confirmPassword") }}</label
                                    >
                                    <x-input
                                        id="confirm-password"
                                        class="w-64 max-w-64"
                                        type="password"
                                        minlength="2"
                                        maxlength="64"
                                        required
                                        size="large"
                                        :value="confirmPassword"
                                        @input="(e: any) => (confirmPassword = e.target.value)"
                                    >
                                        <x-icon href="#lock"></x-icon>
                                        <x-label>{{ t("userConfig.confirmPassword") }}</x-label>
                                    </x-input>
                                </div>
                            </div>

                            <div class="flex flex-col gap-4 mt-6">
                                <div id="username-errors" class="h-[4rem] text-red-400 text-sm font-semibold space-y-1">
                                    <div v-for="error in usernameErrors" :key="error">
                                        <Icon icon="line-md:alert" class="inline size-4 -translate-y-0.5"></Icon>
                                        {{ t(error) }}
                                    </div>
                                </div>
                                <div id="password-errors" class="text-red-400 text-sm font-semibold space-y-1">
                                    <div v-for="error in passwordErrors" :key="error">
                                        <Icon icon="line-md:alert" class="inline size-4 -translate-y-0.5"></Icon>
                                        {{ t(error) }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button
                                :disabled="usernameErrors.length || passwordErrors.length"
                                toggled
                                class="px-6"
                                @click="currentStepIdx++"
                                >{{ t("prerequisites.nextButton") }}</x-button
                            >
                        </div>
                    </div>

                    <!-- Hardware Configuration -->
                    <div v-if="currentStep.id === StepID.HARDWARE_CONFIG" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("hardwareConfig.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("hardwareConfig.description1") }}
                        </p>

                        <p class="text-lg text-gray-400">
                            {{ t("hardwareConfig.description2") }}
                        </p>

                        <div class="flex flex-col gap-6">
                            <div>
                                <label for="select-cpu-cores" class="text-sm text-neutral-400">{{ t("hardwareConfig.cpuCores") }}</label>
                                <div class="flex flex-row gap-4 items-center">
                                    <x-slider
                                        id="select-cpu-cores"
                                        @change="(e: any) => (cpuCores = Number(e.target.value))"
                                        class="w-[50%]"
                                        :value="cpuCores"
                                        :min="MIN_CPU_CORES"
                                        :max="specs.cpuCores"
                                        step="1"
                                        ticks
                                    ></x-slider>
                                    <x-label>{{ t("hardwareConfig.cores", { count: cpuCores }) }}</x-label>
                                </div>
                            </div>

                            <div>
                                <label for="select-ram" class="text-sm text-neutral-400">
                                    {{ t("hardwareConfig.ram") }}
                                    <span
                                        v-if="memoryInfo.availableGB < ramGB"
                                        class="relative group text-white font-bold text-xs rounded-full bg-red-600 px-2 pb-0.5 ml-2 hover:bg-red-700 transition"
                                    >
                                        <Icon icon="line-md:alert" class="inline size-4 -translate-y-0.5"></Icon>
                                        {{ t("hardwareConfig.warning") }}
                                        <span
                                            class="absolute bottom-5 right-[-160px] z-50 w-[320px] bg-neutral-900 text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none"
                                        >
                                            {{ t("hardwareConfig.ramWarning", { availableGB: memoryInfo.availableGB }) }}
                                        </span>
                                    </span>
                                </label>
                                <div class="flex flex-row gap-4 items-center">
                                    <x-slider
                                        id="select-ram"
                                        @change="(e: any) => (ramGB = Number(e.target.value))"
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
                                <label for="select-disk" class="text-sm text-neutral-400">
                                    {{ t("hardwareConfig.diskSize") }}
                                    <span
                                        v-if="(installFolderDiskSpaceGB || 0) - diskSpaceGB < 5"
                                        class="relative group text-white font-bold text-xs rounded-full bg-red-600 px-2 pb-0.5 ml-2 hover:bg-red-700 transition"
                                    >
                                        <Icon icon="line-md:alert" class="inline size-4 -translate-y-0.5"></Icon>
                                        {{ t("hardwareConfig.warning") }}
                                        <span
                                            class="absolute bottom-5 right-[-160px] z-50 w-[320px] bg-neutral-900 text-xs text-gray-300 rounded-lg shadow-lg px-3 py-2 hidden group-hover:block transition-opacity duration-200 pointer-events-none"
                                        >
                                            {{ t("hardwareConfig.diskWarning", { availableGB: installFolderDiskSpaceGB, installFolder: installFolder }) }}
                                        </span>
                                    </span>
                                </label>
                                <div class="flex flex-row gap-4 items-center">
                                    <x-slider
                                        id="select-disk"
                                        @change="(e: any) => (diskSpaceGB = Number(e.target.value))"
                                        class="w-[50%]"
                                        :value="diskSpaceGB"
                                        :min="MIN_DISK_GB"
                                        :max="installFolderDiskSpaceGB || 0"
                                        step="8"
                                    ></x-slider>
                                    <x-label>{{ diskSpaceGB }} GB</x-label>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">{{ t("prerequisites.nextButton") }}</x-button>
                        </div>
                    </div>

                    <!-- Home Folder Sharing -->
                    <div v-if="currentStep.id === StepID.SHOULD_SHARE_HOME_FOLDER" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("homeFolderSharing.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("homeFolderSharing.description1") }}
                        </p>
                        <p class="text-lg text-gray-400" v-html="t('homeFolderSharing.description2')"></p>

                        <x-checkbox
                            class="my-4"
                            @toggle="homeFolderSharing = !homeFolderSharing"
                            :toggled="homeFolderSharing"
                        >
                            <x-label><strong>{{ t("homeFolderSharing.enableSharing") }}</strong></x-label>
                            <x-label class="text-gray-400">
                                {{ t("homeFolderSharing.acknowledge") }}
                            </x-label>
                        </x-checkbox>

                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button toggled class="px-6" @click="currentStepIdx++">{{ t("prerequisites.nextButton") }}</x-button>
                        </div>
                    </div>

                    <!-- Review -->
                    <div v-if="currentStep.id === StepID.REVIEW" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("review.title") }}</h1>
                        <p class="text-lg text-gray-400">
                            {{ t("review.description") }}
                        </p>

                        <div class="bg-neutral-800 p-6 rounded-lg flex flex-col gap-4">
                            <h2 class="text-xl font-medium text-white mt-0 mb-2">{{ t("review.yourConfig") }}</h2>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.winVersion") }}</span>
                                    <span class="text-base text-white">{{ WINDOWS_VERSIONS[windowsVersion] }}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.language") }}</span>
                                    <span class="text-base text-white">{{ windowsLanguage }}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.cpuCores") }}</span>
                                    <span class="text-base text-white">{{ t("hardwareConfig.cores", { count: cpuCores }) }}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.ram") }}</span>
                                    <span class="text-base text-white">{{ ramGB }} GB</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.diskSize") }}</span>
                                    <span class="text-base text-white">{{ diskSpaceGB }} GB</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.username") }}</span>
                                    <span class="text-base text-white">{{ username }}</span>
                                </div>
                                <div class="flex flex-col">
                                    <span class="text-sm text-gray-400">{{ t("review.installLocation") }}</span>
                                    <span class="text-base text-white">{{ installFolder }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-row gap-4 mt-6">
                            <x-button class="px-6" @click="currentStepIdx--">{{ t("license.backButton") }}</x-button>
                            <x-button
                                toggled
                                class="px-6"
                                @click="
                                    currentStepIdx++;
                                    install();
                                "
                                >{{ t("review.installButton") }}</x-button
                            >
                        </div>
                    </div>

                    <!-- Installation -->
                    <div v-if="currentStep.id === StepID.INSTALL" class="step-block">
                        <h1 class="text-3xl font-semibold">{{ t("install.title") }}</h1>
                        <p class="text-lg text-gray-400 text-justify" v-html="t('install.description', { novncURL: novncURL })">
                        </p>

                        <!-- Installing -->
                        <div
                            v-if="
                                installState !== InstallStates.COMPLETED && installState !== InstallStates.INSTALL_ERROR
                            "
                            class="flex flex-col h-full items-center justify-center gap-4"
                        >
                            <x-throbber class="size-16"></x-throbber>
                            <x-label
                                v-if="installState !== InstallStates.MONITORING_PREINSTALL"
                                class="text-lg text-gray-400 text-center"
                            >
                                {{ t("install.installing", { state: installState }) }}
                            </x-label>
                            <x-label v-else class="text-lg text-gray-400 text-center">
                                {{ t("install.preinstall", { message: preinstallMsg }) }}
                            </x-label>
                        </div>

                        <!-- Error -->
                        <div
                            v-if="installState === InstallStates.INSTALL_ERROR"
                            class="flex flex-col h-full items-center justify-center gap-4"
                        >
                            <Icon icon="line-md:alert" class="size-16 text-red-500"></Icon>
                            <x-label class="text-lg text-gray-400 text-center" v-html="t('install.error')">
                            </x-label>
                            <x-label class="text-lg text-gray-400 text-center" v-html="t('install.retry')">
                            </x-label>
                        </div>

                        <!-- Completed -->
                        <div
                            v-if="installState === InstallStates.COMPLETED"
                            class="flex flex-col h-full items-center justify-center gap-4"
                        >
                            <Icon icon="line-md:confirm-circle" class="size-16 text-green-500"></Icon>
                            <x-label class="text-lg text-gray-400 text-center">
                                {{ t("install.completed") }}
                            </x-label>
                            <x-button @click="$router.push('/home')">{{ t("install.finishButton") }}</x-button>
                        </div>
                    </div>
                </div>
            </Transition>
        </div>
        <div class="absolute gradient-bg left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] -z-10"></div>
    </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { computedAsync } from "@vueuse/core";
import { InstallConfiguration, Specs } from "../../types";
import { getSpecs, getMemoryInfo, defaultSpecs, satisfiesPrequisites, type MemoryInfo } from "../lib/specs";
import { WINDOWS_VERSIONS, WINDOWS_LANGUAGES, type WindowsVersionKey, GUEST_NOVNC_PORT } from "../lib/constants";
import { InstallManager, type InstallState, InstallStates } from "../lib/install";
import { openAnchorLink } from "../utils/openLink";
import license from "../assets/LICENSE.txt?raw";
import { PortManager } from "../utils/port";

const path: typeof import("path") = require("path");
const electron: typeof import("electron") = require("electron").remote || require("@electron/remote");
const fs: typeof import("fs") = require("fs");
const os: typeof import("os") = require("os");
const checkDiskSpace: typeof import("check-disk-space").default = require("check-disk-space").default;

const { t } = useI18n();

type Step = {
    id: string;
    title: string;
    icon: string;
};

enum StepID {
    WELCOME = "STEP_WELCOME",
    PREREQUISITES = "STEP_PREREQUISITES",
    LICENSE = "STEP_LICENSE",
    INSTALL_LOCATION = "STEP_INSTALL_LOCATION",
    WINDOWS_CONFIG = "STEP_WINDOWS_CONFIG",
    HARDWARE_CONFIG = "STEP_HARDWARE_CONFIG",
    USER_CONFIG = "STEP_USER_CONFIG",
    SHOULD_SHARE_HOME_FOLDER = "STEP_SHOULD_SHARE_HOME_FOLDER",
    REVIEW = "STEP_OVERVIEW",
    INSTALL = "STEP_INSTALL",
    FINISH = "STEP_FINISH",
}

const steps: Step[] = [
    {
        id: StepID.WELCOME,
        title: t("welcome.title"),
        icon: "tdesign:wave-bye-filled",
    },
    {
        id: StepID.LICENSE,
        title: t("license.title"),
        icon: "line-md:text-box-multiple",
    },
    {
        id: StepID.PREREQUISITES,
        title: t("prerequisites.title"),
        icon: "line-md:check-all",
    },
    {
        id: StepID.INSTALL_LOCATION,
        title: t("installLocation.title"),
        icon: "line-md:folder-arrow-down-filled",
    },
    {
        id: StepID.WINDOWS_CONFIG,
        title: t("windowsConfig.title"),
        icon: "mage:microsoft-windows",
    },
    {
        id: StepID.USER_CONFIG,
        title: t("userConfig.title"),
        icon: "line-md:account",
    },
    {
        id: StepID.HARDWARE_CONFIG,
        title: t("hardwareConfig.title"),
        icon: "famicons:hardware-chip-outline",
    },
    {
        id: StepID.SHOULD_SHARE_HOME_FOLDER,
        title: t("homeFolderSharing.title"),
        icon: "line-md:link",
    },
    {
        id: StepID.REVIEW,
        title: t("review.title"),
        icon: "solar:pin-list-bold",
    },
    {
        id: StepID.INSTALL,
        title: t("install.title"),
        icon: "line-md:downloading-loop",
    },
    {
        id: StepID.FINISH,
        title: t("install.finishButton"),
        icon: "bx:bxs-check-circle",
    },
];

const MIN_CPU_CORES = 1;
const MIN_RAM_GB = 2;
const MIN_DISK_GB = 32;
const $router = useRouter();
const specs = ref<Specs>({ ...defaultSpecs });
const currentStepIdx = ref(0);
const currentStep = computed(() => steps[currentStepIdx.value]);
const installFolder = ref(path.join(os.homedir(), "winboat"));
const windowsVersion = ref<WindowsVersionKey>("11");
const windowsLanguage = ref("English");
const customIsoPath = ref("");
const customIsoFileName = ref("");
const cpuCores = ref(2);
const ramGB = ref(4);
const memoryInfo = ref<MemoryInfo>({ totalGB: 0, availableGB: 0 });
const memoryInterval = ref<NodeJS.Timeout | null>(null);
const diskSpaceGB = ref(32);
const username = ref("winboat");
const password = ref("");
const confirmPassword = ref("");
const homeFolderSharing = ref(false);
const installState = ref<InstallState>(InstallStates.IDLE);
const preinstallMsg = ref("");

let installManager: InstallManager | null = null;

onMounted(async () => {
    specs.value = await getSpecs();
    console.log("Specs", specs.value);

    memoryInfo.value = await getMemoryInfo();
    memoryInterval.value = setInterval(async () => {
        memoryInfo.value = await getMemoryInfo();
    }, 1000);
    console.log("Memory Info", memoryInfo.value);

    username.value = os.userInfo().username;
    console.log("Username", username.value);
});

onUnmounted(() => {
    if (memoryInterval.value) {
        clearInterval(memoryInterval.value);
    }
});

const usernameErrors = computed(() => {
    let errors: string[] = [];

    // At least 2 characters
    if (username.value.length < 2) {
        errors.push("userConfig.errors.user.tooShort");
    }

    // Only alphanumeric characters are allowed
    if (!/^[a-zA-Z0-9]+$/.test(username.value)) {
        errors.push("userConfig.errors.user.alphanumeric");
    }

    return errors;
});

const passwordErrors = computed(() => {
    let errors: string[] = [];

    // Must match confirm password
    if (password.value !== confirmPassword.value) {
        errors.push("userConfig.errors.pass.noMatch");
    }

    // Only alphanumeric characters are allowed
    if (!/^[a-zA-Z0-9]+$/.test(password.value)) {
        errors.push("userConfig.errors.pass.alphanumeric");
    }

    // At least 4 characters
    if (password.value.length < 4) {
        errors.push("userConfig.errors.pass.tooShort");
    }

    return errors;
});

const novncURL = computed(() => {
    const port = installManager?.portMgr.value?.getHostPort(GUEST_NOVNC_PORT) ?? GUEST_NOVNC_PORT;

    return `http://127.0.0.1:${port}`;
});

function selectIsoFile() {
    electron.dialog
        .showOpenDialog({
            title: "Select ISO File",
            filters: [
                {
                    name: "ISO Files",
                    extensions: ["iso"],
                },
            ],
            properties: ["openFile"],
        })
        .then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                customIsoPath.value = result.filePaths[0];
                customIsoFileName.value = path.basename(result.filePaths[0]);
                windowsLanguage.value = "English"; // Language can't be custom
                windowsVersion.value = "custom";
                console.log("ISO path updated:", customIsoPath.value);
            }
        });
}

function deselectIsoFile() {
    customIsoPath.value = "";
    customIsoFileName.value = "";
    windowsLanguage.value = "English";
    windowsVersion.value = "11";
}

function selectInstallFolder() {
    electron.dialog
        .showOpenDialog({
            title: "Select Install Folder",
            properties: ["openDirectory", "createDirectory"],
        })
        .then(result => {
            if (!result.canceled && result.filePaths.length > 0) {
                const selectedPath = result.filePaths[0];
                const finalPath = path.join(selectedPath, "winboat");
                console.log("Install path selected:", finalPath);
                installFolder.value = finalPath;
            }
        });
}

const installFolderErrors = computedAsync(async () => {
    let errors: string[] = [];

    if (!installFolder.value) {
        errors.push("Please select an install location");
        return errors; // <- The rest shouldn't be ran if no path is selected
    }

    // Path without /winboat
    const parentPath = path.dirname(installFolder.value);
    console.log("Parent path", parentPath);

    // Check if path is writable
    try {
        fs.accessSync(parentPath, fs.constants.W_OK);
    } catch (err) {
        console.error(err);
        errors.push("The selected install location is not writable");
    }

    // Check if we have enough disk space
    const diskSpace = await checkDiskSpace(parentPath);
    const freeGB = Math.floor(diskSpace.free / (1024 * 1024 * 1024));
    if (freeGB < MIN_DISK_GB) {
        errors.push(
            `Not enough disk space available. At least ${MIN_DISK_GB} GB is required, but only ${freeGB} GB is available.`,
        );
    }

    return errors;
});

const installFolderDiskSpaceGB = computedAsync(async () => {
    if (!installFolder.value) return 0;

    const parentPath = path.dirname(installFolder.value);
    const diskSpace = await checkDiskSpace(parentPath);
    const freeGB = Math.floor(diskSpace.free / (1024 * 1024 * 1024));
    return freeGB;
});

function install() {
    const installConfig: InstallConfiguration = {
        windowsVersion: windowsVersion.value,
        windowsLanguage: windowsLanguage.value,
        cpuCores: cpuCores.value,
        ramGB: ramGB.value,
        installFolder: installFolder.value,
        diskSpaceGB: diskSpaceGB.value,
        username: username.value,
        password: password.value,
        shareHomeFolder: homeFolderSharing.value,
        ...(customIsoPath.value ? { customIsoPath: customIsoPath.value } : {}),
    };

    installManager = new InstallManager(installConfig);

    // Begin installation and attach event listeners
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
    background:
        linear-gradient(197.37deg, #7450db -0.38%, rgba(138, 234, 240, 0) 101.89%),
        linear-gradient(115.93deg, #3e88f6 4.86%, rgba(62, 180, 246, 0.33) 38.05%, rgba(62, 235, 246, 0) 74.14%),
        radial-gradient(
            56.47% 76.87% at 6.92% 7.55%,
            rgba(62, 136, 246, 0.7) 0%,
            rgba(62, 158, 246, 0.182) 52.16%,
            rgba(62, 246, 246, 0) 100%
        ),
        linear-gradient(306.53deg, #2ee4e3 19.83%, rgba(46, 228, 227, 0) 97.33%);
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
