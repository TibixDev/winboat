export function debounce(func: Function, timeout = 300): Function {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            // @ts-ignore - Even casting as any fails
            func.apply(this, args);
        }, timeout);
    };
}
