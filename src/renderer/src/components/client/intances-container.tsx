import InstanceComponent from './instance'

export default function InstancesContainerComponent(): JSX.Element {
  return (
    <div className="container">
      <div className="grid grid-cols-2 gap-4">
        <InstanceComponent
          name="KI5's vehicle collection"
          cover="https://i.imgur.com/fz2uSjQ.jpeg"
        />
        <InstanceComponent
          name="KI5's vehicle collection"
          cover="https://i.imgur.com/fz2uSjQ.jpeg"
        />
        <InstanceComponent
          name="KI5's vehicle collection"
          cover="https://i.imgur.com/fz2uSjQ.jpeg"
        />
      </div>
    </div>
  )
}
