export function debounce(func: Function, timeout = 300): Function {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timer);
        // @ts-ignore - Even casting as any fails
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}