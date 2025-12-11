"use client";

import React, { useEffect, useState } from 'react';
import { getHelperClient, HelperClient } from '@/lib/helper-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, RefreshCw, Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ConnectionInfo {
  connected: boolean;
  port?: number;
  token?: string;
  error?: string;
}

export function HelperConnectionStatus() {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    connected: false
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [customPort, setCustomPort] = useState('13131');
  const [customToken, setCustomToken] = useState('');

  useEffect(() => {
    // Initial connection attempt
    attemptConnection();

    // Listen for connection events
    const helper = getHelperClient();
    
    const handleConnected = (info: any) => {
      setConnectionInfo({
        connected: true,
        port: info.port,
        token: info.token
      });
      setIsConnecting(false);
    };

    const handleDisconnected = (info: any) => {
      setConnectionInfo({
        connected: false,
        error: info?.lastError
      });
      setIsConnecting(false);
    };

    helper.on('connected', handleConnected);
    helper.on('disconnected', handleDisconnected);

    return () => {
      helper.off('connected', handleConnected);
      helper.off('disconnected', handleDisconnected);
    };
  }, []);

  const attemptConnection = async () => {
    setIsConnecting(true);
    const helper = getHelperClient();
    
    try {
      const connected = await helper.connect();
      if (!connected) {
        const info = helper.getConnectionInfo();
        setConnectionInfo({
          connected: false,
          error: info?.lastError || 'Failed to connect'
        });
      }
    } catch (error: any) {
      setConnectionInfo({
        connected: false,
        error: error.message || 'Connection error'
      });
    }
    
    setIsConnecting(false);
  };

  const handleManualConnect = async () => {
    setIsConnecting(true);
    const helper = getHelperClient({
      port: parseInt(customPort),
      token: customToken || undefined
    });
    
    try {
      const connected = await helper.connect();
      if (connected) {
        setShowSetup(false);
      } else {
        const info = helper.getConnectionInfo();
        setConnectionInfo({
          connected: false,
          error: info?.lastError || 'Failed to connect'
        });
      }
    } catch (error: any) {
      setConnectionInfo({
        connected: false,
        error: error.message || 'Connection error'
      });
    }
    
    setIsConnecting(false);
  };

  return (
    <div className="flex items-center gap-2">
      {connectionInfo.connected ? (
        <>
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm text-muted-foreground">
            Helper connected (port {connectionInfo.port})
          </span>
        </>
      ) : (
        <>
          <AlertCircle className="w-4 h-4 text-yellow-500" />
          <span className="text-sm text-muted-foreground">
            Helper not connected
          </span>
          
          {!isConnecting && (
            <Button
              size="sm"
              variant="outline"
              onClick={attemptConnection}
              className="h-7"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          )}
        </>
      )}

      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
          >
            <Settings className="w-3 h-3" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Helper Connection Settings</DialogTitle>
            <DialogDescription>
              Configure the connection to the Automaker helper service.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={customPort}
                onChange={(e) => setCustomPort(e.target.value)}
                placeholder="13131"
              />
              <p className="text-xs text-muted-foreground">
                Default port range: 13131-13140
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="token">Auth Token (optional)</Label>
              <Input
                id="token"
                type="text"
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="Leave empty for auto-discovery"
              />
            </div>

            {connectionInfo.error && (
              <div className="p-3 text-sm bg-destructive/10 text-destructive rounded-md">
                {connectionInfo.error}
              </div>
            )}

            <div className="p-3 text-sm bg-muted rounded-md">
              <p className="font-medium mb-1">To start the helper service:</p>
              <code className="block bg-background px-2 py-1 rounded text-xs">
                cd helper && npm start
              </code>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSetup(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleManualConnect}
              disabled={isConnecting}
            >
              {isConnecting && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              Connect
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isConnecting && (
        <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}