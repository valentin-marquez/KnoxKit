import InstancesContainerComponent from '@/components/client/intances-container'

interface AppProps {
  className?: string
}

function App({ className }: AppProps): JSX.Element {
  return (
    <div className={className}>
      <div className="flex h-screen w-screen bg-background">
        <div className="w-64 py-4 shadow-lg bg-card space-y-4">
          <h1 className="font-bold text-xl text-center underline-offset-1 s">KnoxKit</h1>
          <ul className="w-full flex flex-col">
            <li className="bg">
              <button className="w-full p-2 text-left bg-background">Collections</button>
            </li>
          </ul>
        </div>
        <div className="flex-grow p-4">
          <InstancesContainerComponent />
        </div>
      </div>
    </div>
  )
}

export default App
