declare module "jaro-winkler" {
  interface JaroWinklerOptions {
    caseSensitive?: boolean;
  }

  function distance(s1: string, s2: string, options?: JaroWinklerOptions): number;

  export default distance;
}