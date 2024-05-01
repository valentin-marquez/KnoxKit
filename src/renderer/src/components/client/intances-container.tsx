import InstanceComponent from './instance'

export default function InstancesContainerComponent(): JSX.Element {
  return (
    <div className="container">
      <div className="grid grid-cols-2 gap-4">
        <InstanceComponent
          name="KI5's vehicle collection"
          cover="https://steamuserimages-a.akamaihd.net/ugc/1794100322296234140/58AE1ADCE80EA2A281ECDF1A8FF8E56DA249FF3D/?imw=200&imh=200&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=true"
        />
        <InstanceComponent
          name="Braven's Mods (PZ)"
          cover="https://steamuserimages-a.akamaihd.net/ugc/2491129613430235016/5C0EA8E2F6FA6162221775B4B4DE88D760DA2C11/?imw=200&imh=200&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=true"
        />
        <InstanceComponent
          name="10 Years Later By Klean"
          cover="https://steamuserimages-a.akamaihd.net/ugc/1842534970153077784/F0607E9C7A194EFB6679F56D51F77AF4E7EBE1EA/?imw=200&imh=200&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=true"
        />
      </div>
    </div>
  )
}
