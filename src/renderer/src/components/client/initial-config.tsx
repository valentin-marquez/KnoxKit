import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { SymbolIcon } from '@radix-ui/react-icons'

export default function InitialConfig(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center p-16 h-screen">
      <div className="flex items-center justify-center h-full w-full">
        <Card className="w-[350px]">
          <CardContent>
            <SymbolIcon className="animate-spin text-center" />
          </CardContent>
          <CardFooter>
            <p className="text-sm text-gray-500">Loading initial configuration...</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
