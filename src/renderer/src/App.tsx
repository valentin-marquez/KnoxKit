import InstancesContainerComponent from '@/components/client/intances-container'

interface AppProps {
  className?: string
}

function App({ className }: AppProps): JSX.Element {
  return (
    <div className={className}>
      <div className="flex h-screen w-screen bg-background">
        <div className="w-64 p-4 shadow-lg bg-card">hola</div>
        <div className="flex-grow p-4">
          <InstancesContainerComponent />
        </div>
      </div>
    </div>
  )
}

export default App
