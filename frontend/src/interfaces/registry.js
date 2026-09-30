import { classicInterface } from "./classic";
import { tactileInterface } from "./tactile";
import { remoteInterface } from "./remote";
import { isAdministrationPath } from "./shared/routeDefinitions";

export const INTERFACES = Object.freeze({
  classic: classicInterface,
  tactile: tactileInterface,
  remote: remoteInterface,
});

export function resolveInterface(mode, pathname = "/") {
  if (isAdministrationPath(pathname)) return classicInterface;
  return Object.prototype.hasOwnProperty.call(INTERFACES, mode)
    ? INTERFACES[mode]
    : classicInterface;
}
