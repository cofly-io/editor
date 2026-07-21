export type SuposRuntimePackageMetadata = {
  appId: string
  displayName: string
  image: string
  baseUrl: string
  appYaml: string
  workloadYaml: string
  menuYaml: string
  unsJson: string
}

export function createSuposRuntimePackageMetadata(input: {
  sceneId: string
  sceneName: string
}): SuposRuntimePackageMetadata {
  const appId = `pascal${input.sceneId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 48)
  const image = `${appId}-frontend:latest`
  const baseUrl = `/os/appbuilder/${appId}/`
  const displayName = input.sceneName.replace(/[\r\n]/g, ' ').trim() || 'Pascal Runtime'

  return {
    appId,
    displayName,
    image,
    baseUrl,
    appYaml: `$kind: apps.supos.com;v1alpha1:Application\n$metadata:\n  name: ${appId}\ngroup: appbuilder\ntype: highCode\nshowName: ${JSON.stringify(displayName)}\nversion: V1.00.00.00\nvendor:\n  name: pascal\n  showName: Pascal\n  email: ""\n  url: ""\n  bluetronId: ""\ndescription: ""\ndoc: ""\nicon: ""\ndependencies: []\n`,
    workloadYaml: `$kind: apps.supos.com;v1alpha1:Workload\n$metadata:\n  name: ${appId}\ncomponents:\n  ${appId}:\n    container:\n      image: ${image}\n      ports:\n        - containerPort: 3000\n      env:\n        BASE_URL: "${baseUrl}"\n        NODE_ENV: "production"\n      resources:\n        limits:\n          memory: "512M"\n          cpu: "0.5"\nroutes:\n  - path:\n      - /\n    component: ${appId}\n    port: 3000\n    public: true\n    stripPath: true\n`,
    menuYaml: `$kind: menu.supos.com;v1alpha1:Menu\n$metadata:\n  name: ${appId}-menu\nforceUpdate: false\nmenus:\n- code: ${appId}\n  nameDefault: ${JSON.stringify(displayName)}\n  displayOrder: 100\n  url: ${baseUrl}\n`,
    unsJson: JSON.stringify({ Label: [], Template: [], UNS: [] }, null, 2),
  }
}
